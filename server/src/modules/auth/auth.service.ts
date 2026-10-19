import { Types } from 'mongoose';
import { UserModel, sanitizePublicUser } from '../users/user.model.js';
import { SessionModel } from './session.model.js';
import { VerificationTokenModel } from './verificationToken.model.js';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  sha256Hash,
} from '../../shared/utils/crypto.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared/errors/AppError.js';
import { logger } from '../../shared/utils/logger.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Development-only in-memory token outbox for inspecting email verification / reset tokens when SMTP is not configured
export const devTokenOutbox = new Map<string, { verifyEmailToken?: string; resetPasswordToken?: string }>();

async function createSessionTokens(
  userId: Types.ObjectId,
  userAgent: string,
  ipAddress: string,
): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const jti = generateSecureToken(24);
  const refreshTokenHash = sha256Hash(jti);

  const session = await SessionModel.create({
    userId,
    refreshTokenHash,
    userAgent: userAgent.slice(0, 250) || 'Unknown Browser',
    ipAddress: ipAddress || '127.0.0.1',
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    lastActiveAt: new Date(),
  });

  const sessionId = String(session._id);
  const accessToken = signAccessToken(String(userId), sessionId);
  const refreshToken = signRefreshToken(String(userId), sessionId, jti);

  return { accessToken, refreshToken, sessionId };
}

export async function registerUser(
  input: {
    displayName: string;
    username: string;
    email: string;
    password: string;
  },
  meta: { userAgent: string; ipAddress: string },
) {
  const normalizedUsername = input.username.trim().toLowerCase();
  const normalizedEmail = input.email.trim().toLowerCase();

  const existing = await UserModel.findOne({
    $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
  }).lean();

  if (existing) {
    if (existing.username === normalizedUsername) {
      throw new ConflictError('Username is already taken', 'USERNAME_TAKEN', {
        field: 'username',
      });
    }
    throw new ConflictError('An account with this email already exists', 'EMAIL_TAKEN', {
      field: 'email',
    });
  }

  const passwordHash = await hashPassword(input.password);

  const user = await UserModel.create({
    displayName: input.displayName.trim(),
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash,
    availability: 'online',
    isOnline: false,
  });

  // Create email verification token (valid 24 hours)
  const rawVerifyToken = generateSecureToken(32);
  await VerificationTokenModel.create({
    userId: user._id,
    tokenHash: sha256Hash(rawVerifyToken),
    purpose: 'verify_email',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  devTokenOutbox.set(normalizedEmail, {
    ...devTokenOutbox.get(normalizedEmail),
    verifyEmailToken: rawVerifyToken,
  });

  logger.audit('user.registered', {
    userId: String(user._id),
    username: user.username,
    ip: meta.ipAddress,
  });

  const tokens = await createSessionTokens(user._id, meta.userAgent, meta.ipAddress);

  return {
    user: sanitizePublicUser(user, String(user._id)),
    ...tokens,
  };
}

export async function loginUser(
  input: { identifier: string; password: string },
  meta: { userAgent: string; ipAddress: string },
) {
  const normalized = input.identifier.trim().toLowerCase();

  const user = await UserModel.findOne({
    $or: [{ email: normalized }, { username: normalized }],
    isDeleted: false,
  }).select('+passwordHash');

  if (!user) {
    throw new UnauthorizedError('Invalid username/email or password', 'INVALID_CREDENTIALS');
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    logger.audit('user.login_failed', { userId: String(user._id), ip: meta.ipAddress });
    throw new UnauthorizedError('Invalid username/email or password', 'INVALID_CREDENTIALS');
  }

  user.lastSeenAt = new Date();
  await user.save();

  const tokens = await createSessionTokens(user._id, meta.userAgent, meta.ipAddress);

  logger.audit('user.logged_in', {
    userId: String(user._id),
    sessionId: tokens.sessionId,
    ip: meta.ipAddress,
  });

  return {
    user: sanitizePublicUser(user, String(user._id)),
    ...tokens,
  };
}

export async function refreshUserSession(rawRefreshToken: string) {
  if (!rawRefreshToken) {
    throw new UnauthorizedError('Refresh token is missing', 'NO_REFRESH_TOKEN');
  }

  const payload = verifyRefreshToken(rawRefreshToken);

  const session = await SessionModel.findById(payload.sid).select('+refreshTokenHash');
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedError('Session is expired or revoked', 'SESSION_REVOKED');
  }

  const incomingHash = sha256Hash(payload.jti);
  if (session.refreshTokenHash !== incomingHash) {
    // Token reuse detected — revoke session immediately
    session.revokedAt = new Date();
    await session.save();
    throw new UnauthorizedError('Invalid refresh session token', 'TOKEN_REUSE_DETECTED');
  }

  const user = await UserModel.findById(session.userId);
  if (!user || user.isDeleted) {
    throw new UnauthorizedError('Account is inactive', 'USER_INACTIVE');
  }

  // Rotate refresh token
  const nextJti = generateSecureToken(24);
  session.refreshTokenHash = sha256Hash(nextJti);
  session.lastActiveAt = new Date();
  session.expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await session.save();

  const sessionId = String(session._id);
  const accessToken = signAccessToken(String(user._id), sessionId);
  const refreshToken = signRefreshToken(String(user._id), sessionId, nextJti);

  return {
    user: sanitizePublicUser(user, String(user._id)),
    accessToken,
    refreshToken,
    sessionId,
  };
}

export async function logoutSession(sessionId: string): Promise<void> {
  await SessionModel.findByIdAndUpdate(sessionId, {
    $set: { revokedAt: new Date() },
  });
}

export async function logoutAllSessions(userId: string): Promise<void> {
  await SessionModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  logger.audit('user.logout_all_sessions', { userId });
}

export async function listUserSessions(userId: string, currentSessionId: string) {
  const sessions = await SessionModel.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastActiveAt: -1 })
    .lean();

  return sessions.map((s) => ({
    _id: String(s._id),
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
    lastActiveAt: s.lastActiveAt,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    isCurrent: String(s._id) === String(currentSessionId),
  }));
}

export async function revokeUserSession(userId: string, targetSessionId: string): Promise<void> {
  const session = await SessionModel.findOne({ _id: targetSessionId, userId });
  if (!session) {
    throw new NotFoundError('Session not found');
  }
  session.revokedAt = new Date();
  await session.save();
  logger.audit('user.session_revoked', { userId, targetSessionId });
}

export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail, isDeleted: false });

  // Never reveal whether the email exists
  if (!user) {
    return;
  }

  await VerificationTokenModel.deleteMany({ userId: user._id, purpose: 'reset_password' });

  const rawResetToken = generateSecureToken(32);
  await VerificationTokenModel.create({
    userId: user._id,
    tokenHash: sha256Hash(rawResetToken),
    purpose: 'reset_password',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
  });

  devTokenOutbox.set(normalizedEmail, {
    ...devTokenOutbox.get(normalizedEmail),
    resetPasswordToken: rawResetToken,
  });

  logger.info('Password reset requested (dev outbox updated)', {
    userId: String(user._id),
  });
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = sha256Hash(rawToken.trim());
  const record = await VerificationTokenModel.findOne({
    tokenHash,
    purpose: 'reset_password',
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    throw new AppError('Reset token is invalid or has expired', 400, 'INVALID_RESET_TOKEN');
  }

  const user = await UserModel.findById(record.userId).select('+passwordHash');
  if (!user || user.isDeleted) {
    throw new AppError('Account not found', 400, 'INVALID_RESET_TOKEN');
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  record.usedAt = new Date();
  await record.save();

  // Revoke all sessions upon password reset
  await SessionModel.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

  logger.audit('user.password_reset', { userId: String(user._id) });
}

export async function verifyEmailWithToken(rawToken: string) {
  const tokenHash = sha256Hash(rawToken.trim());
  const record = await VerificationTokenModel.findOne({
    tokenHash,
    purpose: 'verify_email',
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    throw new AppError('Verification link is invalid or has expired', 400, 'INVALID_VERIFY_TOKEN');
  }

  const user = await UserModel.findById(record.userId);
  if (!user || user.isDeleted) {
    throw new AppError('Account not found', 400, 'INVALID_VERIFY_TOKEN');
  }

  user.emailVerified = true;
  await user.save();

  record.usedAt = new Date();
  await record.save();

  logger.audit('user.email_verified', { userId: String(user._id) });
  return sanitizePublicUser(user, String(user._id));
}
