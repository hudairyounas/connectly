import { Types } from 'mongoose';
import { UserModel, sanitizePublicUser } from './user.model.js';
import { SessionModel } from '../auth/session.model.js';
import { hashPassword, verifyPassword } from '../../shared/utils/crypto.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared/errors/AppError.js';
import { socketManager } from '../../sockets/emitter.js';
import { logger } from '../../shared/utils/logger.js';

export async function getMyProfile(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user || user.isDeleted) {
    throw new NotFoundError('User profile not found');
  }
  return sanitizePublicUser(user, userId);
}

export async function updateMyProfile(
  userId: string,
  updates: {
    displayName?: string;
    username?: string;
    bio?: string;
    statusText?: string;
    availability?: 'online' | 'away' | 'busy' | 'offline';
    avatar?: string | null;
  },
) {
  const user = await UserModel.findById(userId);
  if (!user || user.isDeleted) {
    throw new NotFoundError('User not found');
  }

  if (updates.username && updates.username !== user.username) {
    const existing = await UserModel.findOne({
      username: updates.username,
      _id: { $ne: user._id },
    }).lean();
    if (existing) {
      throw new ConflictError('Username is already taken', 'USERNAME_TAKEN', {
        field: 'username',
      });
    }
    user.username = updates.username;
  }

  if (updates.displayName !== undefined) user.displayName = updates.displayName;
  if (updates.bio !== undefined) user.bio = updates.bio;
  if (updates.statusText !== undefined) user.statusText = updates.statusText;
  if (updates.availability !== undefined) user.availability = updates.availability;
  if (updates.avatar !== undefined) user.avatar = updates.avatar;

  await user.save();

  // Broadcast presence/profile update if availability changed
  if (updates.availability !== undefined) {
    const showOnline = user.privacySettings.onlineVisibility !== 'nobody';
    socketManager.getServer()?.emit('presence:updated', {
      userId: String(user._id),
      isOnline: showOnline ? user.isOnline && user.availability !== 'offline' : false,
      availability: showOnline ? user.availability : 'offline',
      lastSeenAt:
        user.privacySettings.lastSeenVisibility !== 'nobody'
          ? user.lastSeenAt.toISOString()
          : null,
    });
  }

  return sanitizePublicUser(user, userId);
}

export async function changeMyPassword(
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user || user.isDeleted) {
    throw new NotFoundError('User not found');
  }

  const isMatch = await verifyPassword(currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new UnauthorizedError('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  // Revoke all other sessions except the current one
  await SessionModel.updateMany(
    { userId: user._id, _id: { $ne: new Types.ObjectId(currentSessionId) }, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  logger.audit('user.password_changed', { userId });
}

export async function deleteMyAccount(userId: string): Promise<void> {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const suffix = String(user._id).slice(-8);
  user.isDeleted = true;
  user.displayName = 'Deleted Account';
  user.username = `deleted_${suffix}_${Date.now().toString(36)}`;
  user.email = `deleted_${suffix}_${Date.now().toString(36)}@deleted.local`;
  user.bio = '';
  user.statusText = '';
  user.avatar = null;
  user.isOnline = false;
  await user.save();

  await SessionModel.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  logger.audit('user.account_deleted', { userId });
}

export async function searchPublicUsers(viewerId: string, query: string, limit = 20) {
  const viewer = await UserModel.findById(viewerId).select('blockedUsers').lean();
  const blockedIds = new Set((viewer?.blockedUsers || []).map(String));

  const filter: Record<string, unknown> = {
    _id: { $ne: new Types.ObjectId(viewerId) },
    isDeleted: false,
  };

  if (query.trim().length > 0) {
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ username: regex }, { displayName: regex }];
  }

  const users = await UserModel.find(filter)
    .sort({ isOnline: -1, displayName: 1 })
    .limit(limit)
    .lean();

  return users.map((u) => ({
    ...sanitizePublicUser(u, viewerId),
    isBlockedByMe: blockedIds.has(String(u._id)),
  }));
}

export async function getPublicUserById(viewerId: string, targetUserId: string) {
  const [viewer, target] = await Promise.all([
    UserModel.findById(viewerId).select('blockedUsers').lean(),
    UserModel.findById(targetUserId).lean(),
  ]);

  if (!target) {
    throw new NotFoundError('User not found');
  }

  const isBlockedByMe = (viewer?.blockedUsers || []).some(
    (id) => String(id) === String(targetUserId),
  );
  const hasBlockedMe = (target.blockedUsers || []).some(
    (id) => String(id) === String(viewerId),
  );

  return {
    ...sanitizePublicUser(target, viewerId),
    isBlockedByMe,
    hasBlockedMe,
  };
}

export async function blockTargetUser(viewerId: string, targetUserId: string) {
  if (String(viewerId) === String(targetUserId)) {
    throw new AppError('You cannot block yourself', 400, 'CANNOT_BLOCK_SELF');
  }

  const target = await UserModel.findById(targetUserId).select('_id').lean();
  if (!target) {
    throw new NotFoundError('User not found');
  }

  await UserModel.findByIdAndUpdate(viewerId, {
    $addToSet: { blockedUsers: new Types.ObjectId(targetUserId) },
  });

  logger.audit('user.blocked', { viewerId, targetUserId });
}

export async function unblockTargetUser(viewerId: string, targetUserId: string) {
  await UserModel.findByIdAndUpdate(viewerId, {
    $pull: { blockedUsers: new Types.ObjectId(targetUserId) },
  });

  logger.audit('user.unblocked', { viewerId, targetUserId });
}

export async function getBlockedUsersList(viewerId: string) {
  const viewer = await UserModel.findById(viewerId)
    .populate('blockedUsers', 'displayName username avatar bio isDeleted')
    .lean();

  if (!viewer) {
    throw new NotFoundError('User not found');
  }

  const list = (viewer.blockedUsers || []) as unknown as Array<{
    _id: Types.ObjectId;
    displayName: string;
    username: string;
    avatar: string | null;
    bio: string;
    isDeleted: boolean;
  }>;

  return list.map((u) => sanitizePublicUser(u, viewerId));
}
