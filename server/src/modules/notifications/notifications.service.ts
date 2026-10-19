import { Types } from 'mongoose';
import { NotificationModel } from './notification.model.js';
import { UserModel } from '../users/user.model.js';
import { socketManager } from '../../sockets/emitter.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

export async function createNotificationIfAllowed(params: {
  userId: string;
  type: 'message' | 'group_invite' | 'group_role' | 'system';
  title: string;
  body: string;
  conversationId?: string | null;
  actorId?: string | null;
  isConversationMuted?: boolean;
}) {
  if (params.isConversationMuted) {
    return null;
  }

  // Avoid duplicate notification if recipient is actively viewing the conversation
  if (
    params.type === 'message' &&
    params.conversationId &&
    socketManager.isUserViewingConversation(params.userId, params.conversationId)
  ) {
    return null;
  }

  const recipient = await UserModel.findById(params.userId)
    .select('notificationSettings isDeleted')
    .lean();

  if (!recipient || recipient.isDeleted || !recipient.notificationSettings?.inAppEnabled) {
    return null;
  }

  const bodyText = recipient.notificationSettings.showPreview
    ? params.body.slice(0, 240)
    : 'New message received';

  const notification = await NotificationModel.create({
    userId: new Types.ObjectId(params.userId),
    type: params.type,
    title: params.title.slice(0, 140),
    body: bodyText,
    conversationId: params.conversationId ? new Types.ObjectId(params.conversationId) : null,
    actorId: params.actorId ? new Types.ObjectId(params.actorId) : null,
    isRead: false,
  });

  const formatted = {
    _id: String(notification._id),
    userId: String(notification.userId),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    conversationId: notification.conversationId ? String(notification.conversationId) : null,
    actorId: notification.actorId ? String(notification.actorId) : null,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
  };

  socketManager.emitToUser(params.userId, 'notification:new', { notification: formatted });

  return formatted;
}

export async function listUserNotifications(userId: string, limit = 40) {
  const notifications = await NotificationModel.find({ userId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const unreadCount = await NotificationModel.countDocuments({
    userId: new Types.ObjectId(userId),
    isRead: false,
  });

  return {
    notifications: notifications.map((n) => ({
      _id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body,
      conversationId: n.conversationId ? String(n.conversationId) : null,
      actorId: n.actorId ? String(n.actorId) : null,
      isRead: n.isRead,
      createdAt: n.createdAt,
    })),
    unreadCount,
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isRead: true } },
    { new: true },
  ).lean();

  if (!notification) {
    throw new NotFoundError('Notification not found');
  }

  return {
    _id: String(notification._id),
    isRead: notification.isRead,
  };
}

export async function markAllNotificationsRead(userId: string) {
  await NotificationModel.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
}
