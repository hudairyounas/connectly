import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validate, objectIdSchema } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { authRateLimiter } from '../../middleware/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas.js';
import {
  handleRegister,
  handleLogin,
  handleRefresh,
  handleLogout,
  handleLogoutAll,
  handleListSessions,
  handleRevokeSession,
  handleForgotPassword,
  handleResetPassword,
  handleVerifyEmail,
} from './auth.controller.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  asyncHandler(handleRegister),
);

authRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  asyncHandler(handleLogin),
);

authRouter.post('/refresh', asyncHandler(handleRefresh));

authRouter.post('/logout', asyncHandler(handleLogout));

authRouter.post('/logout-all', requireAuth, asyncHandler(handleLogoutAll));

authRouter.get('/sessions', requireAuth, asyncHandler(handleListSessions));

authRouter.delete(
  '/sessions/:sessionId',
  requireAuth,
  validate({ params: z.object({ sessionId: objectIdSchema }) }),
  asyncHandler(handleRevokeSession),
);

authRouter.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(handleForgotPassword),
);

authRouter.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(handleResetPassword),
);

authRouter.post(
  '/verify-email',
  authRateLimiter,
  validate({ body: verifyEmailSchema }),
  asyncHandler(handleVerifyEmail),
);

authRouter.get(
  '/dev-outbox',
  asyncHandler(async (req, res) => {
    const { env } = await import('../../config/env.js');
    if (env.NODE_ENV === 'production' || env.SMTP_HOST) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not available' } });
      return;
    }
    const { devTokenOutbox } = await import('./auth.service.js');
    const email = String(req.query.email || '').trim().toLowerCase();
    const tokens = devTokenOutbox.get(email) || {};
    res.status(200).json({
      success: true,
      data: {
        smtpConfigured: false,
        email,
        verifyEmailToken: tokens.verifyEmailToken || null,
        resetPasswordToken: tokens.resetPasswordToken || null,
      },
    });
  }),
);

