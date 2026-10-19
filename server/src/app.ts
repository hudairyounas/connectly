import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError } from './shared/errors/AppError.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { conversationsRouter } from './modules/conversations/conversations.routes.js';
import { messagesRouter } from './modules/messages/messages.routes.js';
import { groupsRouter } from './modules/groups/groups.routes.js';
import { attachmentsRouter } from './modules/attachments/attachments.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';

export function createApp() {
  const app = express();

  // Trust first reverse proxy (e.g. Nginx on AWS EC2) for accurate client IP & rate limiting
  app.set('trust proxy', 1);

  const allowedOrigins = env.CLIENT_ORIGIN.split(',').map((o) => o.trim());

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api/v1', apiRateLimiter);

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        appName: env.APP_NAME,
        environment: env.NODE_ENV,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/conversations', conversationsRouter);
  app.use('/api/v1/messages', messagesRouter);
  app.use('/api/v1/groups', groupsRouter);
  app.use('/api/v1/attachments', attachmentsRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1/notifications', notificationsRouter);

  app.use((_req, _res, next) => {
    next(new NotFoundError('API endpoint not found'));
  });

  app.use(errorHandler);

  return app;
}
