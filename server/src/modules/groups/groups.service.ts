import { Types } from 'mongoose';
import { ConversationModel } from '../conversations/conversation.model.js';
import { formatConversationForUser } from '../conversations/conversations.service.js';
import { UserModel } from '../users/user.model.js';
import { sendMessage } from '../messages/messages.service.js';
import { createNotificationIfAllowed } from '../notifications/notifications.service.js';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/AppError.js';
import { env } from '../../config/env.js';
import { socketManager } from '../../sockets/emitter.js';

async function broadcastConversationUpdated(conversationId: string, extraUserIds: string[] = []) {
  const conv = await ConversationModel.findById(conversationId).populate('participants.userId');
  if (!conv) return;

  for (const part of conv.participants) {
    const uid =
      typeof part.userId === 'object' && '_id' in part.userId
        ? String(part.userId._id)
        : String(part.userId);
    const formatted = await formatConversationForUser(conv, uid);
    socketManager.emitToUser(uid, 'conversation:updated', { conversation: formatted });
  }

  for (const removedId of extraUserIds) {
    socketManager.emitToUser(removedId, 'conversation:removed', { conversationId });
  }
}

export async function createGroupConversation(params: {
  creatorId: string;
  groupName: string;
  groupDescription?: string;
  groupAvatar?: string | null;
  participantIds: string[];
}) {
  const trimmedName = params.groupName.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) {
    throw new AppError('Group name must be between 2 and 100 characters', 400);
  }

  const uniqueMemberIds = Array.from(
    new Set([params.creatorId, ...params.participantIds.map(String)]),
  );

  if (uniqueMemberIds.length < 2) {
    throw new AppError('A group conversation requires at least 2 participants', 400);
  }

  if (uniqueMemberIds.length > env.MAX_GROUP_MEMBERS) {
    throw new AppError(
      `Group cannot exceed ${env.MAX_GROUP_MEMBERS} members`,
      400,
      'MAX_GROUP_MEMBERS_EXCEEDED',
    );
  }

  const users = await UserModel.find({
    _id: { $in: uniqueMemberIds.map((id) => new Types.ObjectId(id)) },
    isDeleted: false,
  })
    .select('_id displayName')
    .lean();

  if (users.length !== uniqueMemberIds.length) {
    throw new AppError('One or more selected participants are invalid or unavailable', 400);
  }

  const creatorDoc = users.find((u) => String(u._id) === String(params.creatorId));

  const conversation = await ConversationModel.create({
    type: 'group',
    groupName: trimmedName,
    groupDescription: (params.groupDescription || '').trim().slice(0, 400),
    groupAvatar: params.groupAvatar ?? null,
    createdBy: new Types.ObjectId(params.creatorId),
    participants: uniqueMemberIds.map((uid) => ({
      userId: new Types.ObjectId(uid),
      role: uid === String(params.creatorId) ? 'admin' : 'member',
      joinedAt: new Date(),
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      isArchived: false,
    })),
    lastActivityAt: new Date(),
  });

  // Create initial system message
  await sendMessage({
    senderId: params.creatorId,
    conversationId: String(conversation._id),
    content: `${creatorDoc?.displayName || 'User'} created group "${trimmedName}"`,
    type: 'system',
  });

  // Notify invited participants
  for (const uid of uniqueMemberIds) {
    if (uid !== String(params.creatorId)) {
      await createNotificationIfAllowed({
        userId: uid,
        type: 'group_invite',
        title: `Added to ${trimmedName}`,
        body: `${creatorDoc?.displayName || 'Someone'} added you to "${trimmedName}"`,
        conversationId: String(conversation._id),
        actorId: params.creatorId,
      });
    }
  }

  const updated = await ConversationModel.findById(conversation._id).populate(
    'participants.userId',
  );
  await broadcastConversationUpdated(String(conversation._id));

  return formatConversationForUser(updated!, params.creatorId);
}

export async function updateGroupDetails(
  actorId: string,
  groupId: string,
  updates: {
    groupName?: string;
    groupDescription?: string;
    groupAvatar?: string | null;
  },
) {
  const conv = await ConversationModel.findOne({ _id: groupId, type: 'group' });
  if (!conv) {
    throw new NotFoundError('Group conversation not found');
  }

  const actorPart = conv.participants.find((p) => String(p.userId) === String(actorId));
  if (!actorPart) {
    throw new ForbiddenError('You are not a member of this group');
  }
  if (actorPart.role !== 'admin') {
    throw new ForbiddenError('Only group administrators can update group settings');
  }

  const actorUser = await UserModel.findById(actorId).select('displayName').lean();
  const changes: string[] = [];

  if (updates.groupName !== undefined) {
    const name = updates.groupName.trim();
    if (name.length < 2 || name.length > 100) {
      throw new AppError('Group name must be between 2 and 100 characters', 400);
    }
    if (name !== conv.groupName) {
      conv.groupName = name;
      changes.push(`changed the group name to "${name}"`);
    }
  }

  if (updates.groupDescription !== undefined) {
    conv.groupDescription = updates.groupDescription.trim().slice(0, 400);
  }

  if (updates.groupAvatar !== undefined) {
    conv.groupAvatar = updates.groupAvatar;
  }

  await conv.save();

  if (changes.length > 0) {
    await sendMessage({
      senderId: actorId,
      conversationId: String(conv._id),
      content: `${actorUser?.displayName || 'Admin'} ${changes.join(' and ')}`,
      type: 'system',
    });
  }

  await broadcastConversationUpdated(String(conv._id));
  const populated = await ConversationModel.findById(conv._id).populate('participants.userId');
  return formatConversationForUser(populated!, actorId);
}

export async function getGroupMembers(viewerId: string, groupId: string) {
  const conv = await ConversationModel.findOne({ _id: groupId, type: 'group' }).populate(
    'participants.userId',
  );
  if (!conv) {
    throw new NotFoundError('Group not found');
  }

  const isMember = conv.participants.some((p) => {
    const uid =
      typeof p.userId === 'object' && '_id' in p.userId
        ? String(p.userId._id)
        : String(p.userId);
    return uid === String(viewerId);
  });

  if (!isMember) {
    throw new ForbiddenError('You are not a member of this group');
  }

  const formatted = await formatConversationForUser(conv, viewerId);
  return formatted.participants;
}

export async function addGroupMembers(
  actorId: string,
  groupId: string,
  userIdsToAdd: string[],
) {
  const conv = await ConversationModel.findOne({ _id: groupId, type: 'group' });
  if (!conv) {
    throw new NotFoundError('Group not found');
  }

  const actorPart = conv.participants.find((p) => String(p.userId) === String(actorId));
  if (!actorPart || actorPart.role !== 'admin') {
    throw new ForbiddenError('Only group administrators can add members');
  }

  const existingIds = new Set(conv.participants.map((p) => String(p.userId)));
  const newIds = Array.from(new Set(userIdsToAdd.map(String))).filter(
    (id) => !existingIds.has(id),
  );

  if (newIds.length === 0) {
    throw new AppError('Selected users are already members of this group', 400);
  }

  if (conv.participants.length + newIds.length > env.MAX_GROUP_MEMBERS) {
    throw new AppError(`Group cannot exceed ${env.MAX_GROUP_MEMBERS} members`, 400);
  }

  const newUsers = await UserModel.find({
    _id: { $in: newIds.map((id) => new Types.ObjectId(id)) },
    isDeleted: false,
  })
    .select('_id displayName')
    .lean();

  if (newUsers.length !== newIds.length) {
    throw new AppError('One or more users could not be found', 400);
  }

  for (const u of newUsers) {
    conv.participants.push({
      userId: u._id,
      role: 'member',
      joinedAt: new Date(),
      lastReadMessageId: null,
      lastReadAt: null,
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      isArchived: false,
    });
  }

  await conv.save();

  const actorUser = await UserModel.findById(actorId).select('displayName').lean();
  const addedNames = newUsers.map((u) => u.displayName).join(', ');

  await sendMessage({
    senderId: actorId,
    conversationId: String(conv._id),
    content: `${actorUser?.displayName || 'Admin'} added ${addedNames} to the group`,
    type: 'system',
  });

  for (const u of newUsers) {
    await createNotificationIfAllowed({
      userId: String(u._id),
      type: 'group_invite',
      title: `Added to ${conv.groupName || 'Group'}`,
      body: `${actorUser?.displayName || 'Admin'} added you to "${conv.groupName || 'Group'}"`,
      conversationId: String(conv._id),
      actorId,
    });
  }

  await broadcastConversationUpdated(String(conv._id));
  const populated = await ConversationModel.findById(conv._id).populate('participants.userId');
  return formatConversationForUser(populated!, actorId);
}

export async function removeGroupMember(
  actorId: string,
  groupId: string,
  targetUserId: string,
) {
  const conv = await ConversationModel.findOne({ _id: groupId, type: 'group' });
  if (!conv) {
    throw new NotFoundError('Group not found');
  }

  const actorPart = conv.participants.find((p) => String(p.userId) === String(actorId));
  if (!actorPart || actorPart.role !== 'admin') {
    throw new ForbiddenError('Only group administrators can remove members');
  }

  if (String(actorId) === String(targetUserId)) {
    throw new AppError('Use the leave group endpoint to leave a group', 400);
  }

  const targetPart = conv.participants.find((p) => String(p.userId) === String(targetUserId));
  if (!targetPart) {
    throw new NotFoundError('User is not a member of this group');
  }

  const [actorUser, targetUser] = await Promise.all([
    UserModel.findById(actorId).select('displayName').lean(),
    UserModel.findById(targetUserId).select('displayName').lean(),
  ]);

  // Emit system message before removing so senderId is authorized
  await sendMessage({
    senderId: actorId,
    conversationId: String(conv._id),
    content: `${actorUser?.displayName || 'Admin'} removed ${targetUser?.displayName || 'a member'} from the group`,
    type: 'system',
  });

  // Reload to avoid overwriting lastMessage from sendMessage
  const freshConv = await ConversationModel.findById(groupId);
  if (freshConv) {
    freshConv.participants = freshConv.participants.filter(
      (p) => String(p.userId) !== String(targetUserId),
    );
    await freshConv.save();
  }

  await broadcastConversationUpdated(String(conv._id), [targetUserId]);
  const populated = await ConversationModel.findById(conv._id).populate('participants.userId');
  return formatConversationForUser(populated!, actorId);
}

export async function leaveGroupConversation(userId: string, groupId: string) {
  const conv = await ConversationModel.findOne({ _id: groupId, type: 'group' });
  if (!conv) {
    throw new NotFoundError('Group not found');
  }

  const part = conv.participants.find((p) => String(p.userId) === String(userId));
  if (!part) {
    throw new ForbiddenError('You are not a member of this group');
  }

  const leavingUser = await UserModel.findById(userId).select('displayName').lean();

  await sendMessage({
    senderId: userId,
    conversationId: String(conv._id),
    content: `${leavingUser?.displayName || 'A member'} left the group`,
    type: 'system',
  });

  const freshConv = await ConversationModel.findById(groupId);
  if (freshConv) {
    freshConv.participants = freshConv.participants.filter(
      (p) => String(p.userId) !== String(userId),
    );

    if (freshConv.participants.length > 0) {
      const hasAdmin = freshConv.participants.some((p) => p.role === 'admin');
      if (!hasAdmin) {
        freshConv.participants[0].role = 'admin';
      }
      await freshConv.save();
      await broadcastConversationUpdated(String(freshConv._id), [userId]);
    } else {
      await freshConv.deleteOne();
    }
  }

  return { groupId, left: true };
}

export async function updateGroupMemberRole(
  actorId: string,
  groupId: string,
  targetUserId: string,
  role: 'admin' | 'member',
) {
  const conv = await ConversationModel.findOne({ _id: groupId, type: 'group' });
  if (!conv) {
    throw new NotFoundError('Group not found');
  }

  const actorPart = conv.participants.find((p) => String(p.userId) === String(actorId));
  if (!actorPart || actorPart.role !== 'admin') {
    throw new ForbiddenError('Only group administrators can change member roles');
  }

  const targetPart = conv.participants.find((p) => String(p.userId) === String(targetUserId));
  if (!targetPart) {
    throw new NotFoundError('Target user is not a member of this group');
  }

  if (role === 'member' && targetPart.role === 'admin') {
    const adminCount = conv.participants.filter((p) => p.role === 'admin').length;
    if (adminCount <= 1) {
      throw new AppError(
        'Cannot demote the only administrator of the group',
        400,
        'LAST_ADMIN',
      );
    }
  }

  targetPart.role = role;
  await conv.save();

  const targetUser = await UserModel.findById(targetUserId).select('displayName').lean();
  const actionLabel =
    role === 'admin' ? 'promoted to group administrator' : 'changed to group member';

  await sendMessage({
    senderId: actorId,
    conversationId: String(conv._id),
    content: `${targetUser?.displayName || 'Member'} was ${actionLabel}`,
    type: 'system',
  });

  await createNotificationIfAllowed({
    userId: targetUserId,
    type: 'group_role',
    title: `Role updated in ${conv.groupName || 'Group'}`,
    body: `Your role in "${conv.groupName || 'Group'}" is now ${role}.`,
    conversationId: String(conv._id),
    actorId,
  });

  await broadcastConversationUpdated(String(conv._id));
  const populated = await ConversationModel.findById(conv._id).populate('participants.userId');
  return formatConversationForUser(populated!, actorId);
}
