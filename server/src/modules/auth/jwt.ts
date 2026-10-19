import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../shared/errors/AppError.js';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
  type: 'refresh';
}

export function signAccessToken(userId: string, sessionId: string): string {
  const payload: AccessTokenPayload = {
    sub: userId,
    sid: sessionId,
    type: 'access',
  };
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string, sessionId: string, jti: string): string {
  const payload: RefreshTokenPayload = {
    sub: userId,
    sid: sessionId,
    jti,
    type: 'refresh',
  };
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AccessTokenPayload;
    if (decoded.type !== 'access' || !decoded.sub || !decoded.sid) {
      throw new UnauthorizedError('Invalid access token');
    }
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Session token has expired', 'TOKEN_EXPIRED');
    }
    throw new UnauthorizedError('Invalid authentication token', 'INVALID_TOKEN');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.REFRESH_TOKEN_SECRET) as RefreshTokenPayload;
    if (decoded.type !== 'refresh' || !decoded.sub || !decoded.sid || !decoded.jti) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    return decoded;
  } catch {
    throw new UnauthorizedError('Refresh session expired or invalid', 'REFRESH_EXPIRED');
  }
}
