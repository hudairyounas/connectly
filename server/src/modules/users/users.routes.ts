import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validate, objectIdSchema } from '../../middleware/validate.js';
import {
  updateProfileSchema,
  changePasswordSchema,
  searchUsersQuerySchema,
} from './users.schemas.js';
import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  deleteMyAccount,
  searchPublicUsers,
  getPublicUserById,
  blockTargetUser,
  unblockTargetUser,
  getBlockedUsersList,
} from './users.service.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getMyProfile(req.user!.userId);
    res.status(200).json({ success: true, data: { user } });
  }),
);

usersRouter.patch(
  '/me',
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await updateMyProfile(req.user!.userId, req.body);
    res.status(200).json({ success: true, data: { user } });
  }),
);

usersRouter.post(
  '/me/change-password',
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await changeMyPassword(
      req.user!.userId,
      req.user!.sessionId,
      req.body.currentPassword,
      req.body.newPassword,
    );
    res.status(200).json({
      success: true,
      data: { message: 'Password updated successfully' },
    });
  }),
);

usersRouter.delete(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    await deleteMyAccount(req.user!.userId);
    res.clearCookie('refreshToken', { path: '/api/v1/auth' });
    res.status(200).json({
      success: true,
      data: { message: 'Account has been deleted' },
    });
  }),
);

usersRouter.get(
  '/me/blocked',
  asyncHandler(async (req: Request, res: Response) => {
    const blockedUsers = await getBlockedUsersList(req.user!.userId);
    res.status(200).json({ success: true, data: { blockedUsers } });
  }),
);

usersRouter.get(
  '/search',
  validate({ query: searchUsersQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = String(req.query.q || '');
    const limit = Number(req.query.limit || 20);
    const users = await searchPublicUsers(req.user!.userId, q, limit);
    res.status(200).json({ success: true, data: { users } });
  }),
);

usersRouter.get(
  '/:userId',
  validate({ params: z.object({ userId: objectIdSchema }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getPublicUserById(req.user!.userId, req.params.userId);
    res.status(200).json({ success: true, data: { user } });
  }),
);

usersRouter.post(
  '/:userId/block',
  validate({ params: z.object({ userId: objectIdSchema }) }),
  asyncHandler(async (req: Request, res: Response) => {
    await blockTargetUser(req.user!.userId, req.params.userId);
    res.status(200).json({ success: true, data: { message: 'User blocked' } });
  }),
);

usersRouter.delete(
  '/:userId/block',
  validate({ params: z.object({ userId: objectIdSchema }) }),
  asyncHandler(async (req: Request, res: Response) => {
    await unblockTargetUser(req.user!.userId, req.params.userId);
    res.status(200).json({ success: true, data: { message: 'User unblocked' } });
  }),
);
