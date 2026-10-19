import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validate, objectIdSchema } from '../../middleware/validate.js';
import {
  listUserConversations,
  getOrCreateDirectConversation,
  getAuthorizedConversation,
  updateMyConversationSettings,
} from './conversations.service.js';
import {
  listConversationMessages,
  sendMessage,
  markConversationRead,
  searchConversationMessages,
} from '../messages/messages.service.js';

export const conversationsRouter = Router();

conversationsRouter.use(requireAuth);

const createDirectSchema = z.object({
  participantId: objectIdSchema,
});

const updateConvSettingsSchema = z.object({
  isMuted: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

const sendMessageBodySchema = z.object({
  content: z.string().max(4000).optional().default(''),
  clientMessageId: z.string().trim().max(100).optional(),
  replyTo: objectIdSchema.nullable().optional(),
  attachmentIds: z.array(objectIdSchema).max(10).optional(),
});

conversationsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const conversations = await listUserConversations(req.user!.userId);
    res.status(200).json({ success: true, data: { conversations } });
  }),
);

conversationsRouter.post(
  '/',
  validate({ body: createDirectSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { conversation, createdNew } = await getOrCreateDirectConversation(
      req.user!.userId,
      req.body.participantId,
    );
    res.status(createdNew ? 201 : 200).json({
      success: true,
      data: { conversation, createdNew },
    });
  }),
);

conversationsRouter.get(
  '/:conversationId',
  validate({ params: z.object({ conversationId: objectIdSchema }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const conversation = await getAuthorizedConversation(
      req.user!.userId,
      req.params.conversationId,
    );
    res.status(200).json({ success: true, data: { conversation } });
  }),
);

conversationsRouter.patch(
  '/:conversationId',
  validate({
    params: z.object({ conversationId: objectIdSchema }),
    body: updateConvSettingsSchema,
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const conversation = await updateMyConversationSettings(
      req.user!.userId,
      req.params.conversationId,
      req.body,
    );
    res.status(200).json({ success: true, data: { conversation } });
  }),
);

conversationsRouter.get(
  '/:conversationId/messages',
  validate({
    params: z.object({ conversationId: objectIdSchema }),
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).optional().default(30),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await listConversationMessages(
      req.user!.userId,
      req.params.conversationId,
      req.query.cursor ? String(req.query.cursor) : undefined,
      Number(req.query.limit || 30),
    );
    res.status(200).json({ success: true, data });
  }),
);

conversationsRouter.post(
  '/:conversationId/messages',
  validate({
    params: z.object({ conversationId: objectIdSchema }),
    body: sendMessageBodySchema,
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await sendMessage({
      senderId: req.user!.userId,
      conversationId: req.params.conversationId,
      content: req.body.content,
      clientMessageId: req.body.clientMessageId,
      replyTo: req.body.replyTo,
      attachmentIds: req.body.attachmentIds,
    });
    res.status(result.deduplicated ? 200 : 201).json({
      success: true,
      data: result,
    });
  }),
);

conversationsRouter.post(
  '/:conversationId/read',
  validate({
    params: z.object({ conversationId: objectIdSchema }),
    body: z.object({ messageId: objectIdSchema.optional() }).optional(),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await markConversationRead(
      req.user!.userId,
      req.params.conversationId,
      req.body?.messageId,
    );
    res.status(200).json({ success: true, data });
  }),
);

conversationsRouter.get(
  '/:conversationId/search',
  validate({
    params: z.object({ conversationId: objectIdSchema }),
    query: z.object({ q: z.string().trim().max(200).optional().default('') }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const messages = await searchConversationMessages(
      req.user!.userId,
      req.params.conversationId,
      String(req.query.q || ''),
    );
    res.status(200).json({ success: true, data: { messages } });
  }),
);
