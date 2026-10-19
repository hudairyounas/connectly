import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validate, objectIdSchema } from '../../middleware/validate.js';
import {
  listUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from './notifications.service.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await listUserNotifications(req.user!.userId);
    res.status(200).json({ success: true, data });
  }),
);

notificationsRouter.patch(
  '/:notificationId/read',
  validate({ params: z.object({ notificationId: objectIdSchema }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const notification = await markNotificationRead(
      req.user!.userId,
      req.params.notificationId,
    );
    res.status(200).json({ success: true, data: { notification } });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    await markAllNotificationsRead(req.user!.userId);
    res.status(200).json({ success: true, data: { message: 'All notifications marked as read' } });
  }),
);
