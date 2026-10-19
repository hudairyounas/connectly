import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../modules/auth/jwt.js';
import { SessionModel } from '../modules/auth/session.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { UnauthorizedError } from '../shared/errors/AppError.js';

export interface AuthenticatedUserContext {
  userId: string;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserContext;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required', 'NO_TOKEN');
    }

    const payload = verifyAccessToken(token);

    const session = await SessionModel.findById(payload.sid).lean();
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Session has been revoked or expired', 'SESSION_REVOKED');
    }

    const user = await UserModel.findById(payload.sub).select('_id isDeleted').lean();
    if (!user || user.isDeleted) {
      throw new UnauthorizedError('Account is no longer active', 'USER_INACTIVE');
    }

    req.user = {
      userId: String(user._id),
      sessionId: String(session._id),
    };

    next();
  } catch (err) {
    next(err);
  }
}
