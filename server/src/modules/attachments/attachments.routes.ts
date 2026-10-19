import { Router, Request, Response } from 'express';
import path from 'path';
import fsSync from 'fs';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validate, objectIdSchema, assertValidObjectId } from '../../middleware/validate.js';
import { AppError, NotFoundError, UnauthorizedError } from '../../shared/errors/AppError.js';
import {
  saveChatAttachment,
  saveAvatarImage,
  getAuthorizedAttachmentFile,
  AVATARS_DIR,
} from './attachments.service.js';
import { verifyAccessToken, verifyRefreshToken } from '../auth/jwt.js';
import { SessionModel } from '../auth/session.model.js';

export const attachmentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_FILE_SIZE_BYTES,
    files: 5,
  },
});

async function resolveAuthenticatedViewer(req: Request): Promise<string> {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const rawAccess =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : queryToken || req.cookies?.accessToken;

  if (rawAccess) {
    const payload = verifyAccessToken(rawAccess);
    const session = await SessionModel.findById(payload.sid).lean();
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Session revoked');
    }
    return payload.sub;
  }

  if (req.cookies?.refreshToken) {
    const payload = verifyRefreshToken(req.cookies.refreshToken);
    const session = await SessionModel.findById(payload.sid).lean();
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Session revoked');
    }
    return payload.sub;
  }

  throw new UnauthorizedError('Authentication required to view attachment');
}

attachmentsRouter.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const conversationId = String(req.body.conversationId || '');
    assertValidObjectId(conversationId, 'conversationId');

    if (!req.file) {
      throw new AppError('No file provided', 400, 'NO_FILE');
    }

    const attachment = await saveChatAttachment({
      uploaderId: req.user!.userId,
      conversationId,
      originalName: req.file.originalname,
      buffer: req.file.buffer,
    });

    res.status(201).json({
      success: true,
      data: { attachment },
    });
  }),
);

attachmentsRouter.post(
  '/avatar',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError('No image file provided', 400, 'NO_FILE');
    }

    const avatarUrl = await saveAvatarImage(req.file.buffer, req.file.originalname);

    res.status(201).json({
      success: true,
      data: { avatarUrl },
    });
  }),
);

attachmentsRouter.get(
  '/avatars/:filename',
  asyncHandler(async (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename);
    const filePath = path.join(AVATARS_DIR, safeName);
    if (!fsSync.existsSync(filePath)) {
      throw new NotFoundError('Avatar not found');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
  }),
);

attachmentsRouter.get(
  '/:attachmentId/file',
  validate({ params: z.object({ attachmentId: objectIdSchema }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await resolveAuthenticatedViewer(req);
    const { attachment, filePath } = await getAuthorizedAttachmentFile(
      userId,
      req.params.attachmentId,
    );

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', attachment.mimeType);
    const disposition =
      req.query.download === '1' || attachment.kind === 'document' ? 'attachment' : 'inline';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(attachment.originalName)}"`,
    );

    res.sendFile(filePath);
  }),
);
