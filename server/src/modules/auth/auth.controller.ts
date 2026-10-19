import { Request, Response } from 'express';
import { env } from '../../config/env.js';
import {
  registerUser,
  loginUser,
  refreshUserSession,
  logoutSession,
  logoutAllSessions,
  listUserSessions,
  revokeUserSession,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyEmailWithToken,
} from './auth.service.js';
import { verifyAccessToken, verifyRefreshToken } from './jwt.js';

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}

export async function handleRegister(req: Request, res: Response): Promise<void> {
  const result = await registerUser(req.body, {
    userAgent: req.headers['user-agent'] || 'Unknown',
    ipAddress: req.ip || '127.0.0.1',
  });

  setRefreshCookie(res, result.refreshToken);

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      sessionId: result.sessionId,
    },
  });
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const result = await loginUser(req.body, {
    userAgent: req.headers['user-agent'] || 'Unknown',
    ipAddress: req.ip || '127.0.0.1',
  });

  setRefreshCookie(res, result.refreshToken);

  res.status(200).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      sessionId: result.sessionId,
    },
  });
}

export async function handleRefresh(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.refreshToken || req.body?.refreshToken || '';
  const result = await refreshUserSession(rawToken);

  setRefreshCookie(res, result.refreshToken);

  res.status(200).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      sessionId: result.sessionId,
    },
  });
}

export async function handleLogout(req: Request, res: Response): Promise<void> {
  if (req.user?.sessionId) {
    await logoutSession(req.user.sessionId);
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = verifyAccessToken(authHeader.slice(7).trim());
        await logoutSession(decoded.sid);
      } catch {
        // Ignore expired/invalid access token during logout
      }
    }
    if (req.cookies?.refreshToken) {
      try {
        const decoded = verifyRefreshToken(req.cookies.refreshToken);
        await logoutSession(decoded.sid);
      } catch {
        // Ignore invalid token during logout
      }
    }
  }

  clearRefreshCookie(res);

  res.status(200).json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
}

export async function handleLogoutAll(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  await logoutAllSessions(userId);
  clearRefreshCookie(res);

  res.status(200).json({
    success: true,
    data: { message: 'All active sessions have been revoked' },
  });
}

export async function handleListSessions(req: Request, res: Response): Promise<void> {
  const sessions = await listUserSessions(req.user!.userId, req.user!.sessionId);
  res.status(200).json({
    success: true,
    data: { sessions },
  });
}

export async function handleRevokeSession(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  await revokeUserSession(req.user!.userId, sessionId);
  res.status(200).json({
    success: true,
    data: { message: 'Session revoked' },
  });
}

export async function handleForgotPassword(req: Request, res: Response): Promise<void> {
  await requestPasswordReset(req.body.email);

  res.status(200).json({
    success: true,
    data: {
      message:
        'If an account is associated with that email address, password reset instructions have been generated.',
    },
  });
}

export async function handleResetPassword(req: Request, res: Response): Promise<void> {
  await resetPasswordWithToken(req.body.token, req.body.password);
  clearRefreshCookie(res);

  res.status(200).json({
    success: true,
    data: {
      message: 'Your password has been reset successfully. Please sign in with your new password.',
    },
  });
}

export async function handleVerifyEmail(req: Request, res: Response): Promise<void> {
  const user = await verifyEmailWithToken(req.body.token);

  res.status(200).json({
    success: true,
    data: {
      message: 'Email address verified successfully.',
      user,
    },
  });
}
