import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validate, objectIdSchema } from '../../middleware/validate.js';
import {
  editMessage,
  deleteMessage,
  toggleMessageReaction,
  acknowledgeMessageDelivered,
} from './messages.service.js';

export const messagesRouter = Router();

messagesRouter.use(requireAuth);

messagesRouter.patch(
  '/:messageId',
  validate({
    params: z.object({ messageId: objectIdSchema }),
    body: z.object({
      content: z.string().trim().min(1, 'Content cannot be empty').max(4000),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const message = await editMessage(req.user!.userId, req.params.messageId, req.body.content);
    res.status(200).json({ success: true, data: { message } });
  }),
);

messagesRouter.delete(
  '/:messageId',
  validate({
    params: z.object({ messageId: objectIdSchema }),
    query: z.object({
      mode: z.enum(['self', 'everyone']).optional().default('everyone'),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const mode = (req.query.mode as 'self' | 'everyone') || 'everyone';
    const data = await deleteMessage(req.user!.userId, req.params.messageId, mode);
    res.status(200).json({ success: true, data });
  }),
);

messagesRouter.post(
  '/:messageId/delivered',
  validate({
    params: z.object({ messageId: objectIdSchema }),
    body: z.object({ conversationId: objectIdSchema }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    await acknowledgeMessageDelivered(
      req.user!.userId,
      req.body.conversationId,
      req.params.messageId,
    );
    res.status(200).json({ success: true, data: { delivered: true } });
  }),
);

messagesRouter.post(
  '/:messageId/reactions',
  validate({
    params: z.object({ messageId: objectIdSchema }),
    body: z.object({
      emoji: z.string().trim().min(1).max(16),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await toggleMessageReaction(
      req.user!.userId,
      req.params.messageId,
      req.body.emoji,
    );
    res.status(200).json({ success: true, data });
  }),
);

messagesRouter.delete(
  '/:messageId/reactions/:reaction',
  validate({
    params: z.object({
      messageId: objectIdSchema,
      reaction: z.string().min(1).max(16),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const emoji = decodeURIComponent(req.params.reaction);
    const data = await toggleMessageReaction(
      req.user!.userId,
      req.params.messageId,
      emoji,
      'remove',
    );
    res.status(200).json({ success: true, data });
  }),
);
