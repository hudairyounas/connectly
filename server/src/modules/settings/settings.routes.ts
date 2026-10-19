import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validate } from '../../middleware/validate.js';
import { UserModel } from '../users/user.model.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { socketManager } from '../../sockets/emitter.js';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

const updateSettingsSchema = z.object({
  privacySettings: z
    .object({
      onlineVisibility: z.enum(['everyone', 'nobody']).optional(),
      lastSeenVisibility: z.enum(['everyone', 'nobody']).optional(),
      readReceipts: z.boolean().optional(),
      profileVisibility: z.enum(['everyone', 'contacts']).optional(),
    })
    .optional(),
  notificationSettings: z
    .object({
      inAppEnabled: z.boolean().optional(),
      soundEnabled: z.boolean().optional(),
      showPreview: z.boolean().optional(),
    })
    .optional(),
  appearanceSettings: z
    .object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
      reducedMotion: z.boolean().optional(),
      enterToSend: z.boolean().optional(),
    })
    .optional(),
});

settingsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await UserModel.findById(req.user!.userId)
      .select('privacySettings notificationSettings appearanceSettings')
      .lean();

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.status(200).json({
      success: true,
      data: {
        privacySettings: user.privacySettings,
        notificationSettings: user.notificationSettings,
        appearanceSettings: user.appearanceSettings,
      },
    });
  }),
);

settingsRouter.patch(
  '/',
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const { privacySettings, notificationSettings, appearanceSettings } = req.body;

    if (privacySettings) {
      user.privacySettings = {
        ...user.privacySettings,
        ...privacySettings,
      };
    }

    if (notificationSettings) {
      user.notificationSettings = {
        ...user.notificationSettings,
        ...notificationSettings,
      };
    }

    if (appearanceSettings) {
      user.appearanceSettings = {
        ...user.appearanceSettings,
        ...appearanceSettings,
      };
    }

    await user.save();

    if (privacySettings) {
      const showOnline = user.privacySettings.onlineVisibility !== 'nobody';
      const showLastSeen = user.privacySettings.lastSeenVisibility !== 'nobody';
      socketManager.getServer()?.emit('presence:updated', {
        userId: String(user._id),
        isOnline: showOnline ? user.isOnline && user.availability !== 'offline' : false,
        availability: showOnline ? user.availability : 'offline',
        lastSeenAt: showLastSeen ? user.lastSeenAt.toISOString() : null,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        privacySettings: user.privacySettings,
        notificationSettings: user.notificationSettings,
        appearanceSettings: user.appearanceSettings,
      },
    });
  }),
);
