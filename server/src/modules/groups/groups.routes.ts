import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validate, objectIdSchema } from '../../middleware/validate.js';
import {
  createGroupConversation,
  updateGroupDetails,
  getGroupMembers,
  addGroupMembers,
  removeGroupMember,
  leaveGroupConversation,
  updateGroupMemberRole,
} from './groups.service.js';

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

const createGroupSchema = z.object({
  groupName: z.string().trim().min(2, 'Group name must be at least 2 characters').max(100),
  groupDescription: z.string().trim().max(400).optional(),
  groupAvatar: z.string().nullable().optional(),
  participantIds: z.array(objectIdSchema).min(1, 'Select at least 1 other participant'),
});

const updateGroupSchema = z.object({
  groupName: z.string().trim().min(2).max(100).optional(),
  groupDescription: z.string().trim().max(400).optional(),
  groupAvatar: z.string().nullable().optional(),
});

groupsRouter.post(
  '/',
  validate({ body: createGroupSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const conversation = await createGroupConversation({
      creatorId: req.user!.userId,
      groupName: req.body.groupName,
      groupDescription: req.body.groupDescription,
      groupAvatar: req.body.groupAvatar,
      participantIds: req.body.participantIds,
    });
    res.status(201).json({ success: true, data: { conversation } });
  }),
);

groupsRouter.patch(
  '/:groupId',
  validate({
    params: z.object({ groupId: objectIdSchema }),
    body: updateGroupSchema,
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const conversation = await updateGroupDetails(
      req.user!.userId,
      req.params.groupId,
      req.body,
    );
    res.status(200).json({ success: true, data: { conversation } });
  }),
);

groupsRouter.get(
  '/:groupId/members',
  validate({ params: z.object({ groupId: objectIdSchema }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const members = await getGroupMembers(req.user!.userId, req.params.groupId);
    res.status(200).json({ success: true, data: { members } });
  }),
);

groupsRouter.post(
  '/:groupId/members',
  validate({
    params: z.object({ groupId: objectIdSchema }),
    body: z.object({
      participantIds: z.array(objectIdSchema).min(1),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const conversation = await addGroupMembers(
      req.user!.userId,
      req.params.groupId,
      req.body.participantIds,
    );
    res.status(200).json({ success: true, data: { conversation } });
  }),
);

groupsRouter.delete(
  '/:groupId/members/:userId',
  validate({
    params: z.object({
      groupId: objectIdSchema,
      userId: objectIdSchema,
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const conversation = await removeGroupMember(
      req.user!.userId,
      req.params.groupId,
      req.params.userId,
    );
    res.status(200).json({ success: true, data: { conversation } });
  }),
);

groupsRouter.post(
  '/:groupId/leave',
  validate({ params: z.object({ groupId: objectIdSchema }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await leaveGroupConversation(req.user!.userId, req.params.groupId);
    res.status(200).json({ success: true, data });
  }),
);

groupsRouter.patch(
  '/:groupId/members/:userId/role',
  validate({
    params: z.object({
      groupId: objectIdSchema,
      userId: objectIdSchema,
    }),
    body: z.object({
      role: z.enum(['admin', 'member']),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const conversation = await updateGroupMemberRole(
      req.user!.userId,
      req.params.groupId,
      req.params.userId,
      req.body.role,
    );
    res.status(200).json({ success: true, data: { conversation } });
  }),
);
