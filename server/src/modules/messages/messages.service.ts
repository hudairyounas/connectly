import { Types } from 'mongoose';
import {
  MessageModel,
  IMessage,
  ALLOWED_REACTIONS,
} from './message.model.js';
import {
  ConversationModel,
} from '../conversations/conversation.model.js';
import { formatConversationForUser } from '../conversations/conversations.service.js';
import { UserModel, sanitizePublicUser, IUser } from '../users/user.model.js';
import { AttachmentModel, IAttachment } from '../attachments/attachment.model.js';
import { formatAttachment } from '../attachments/attachments.service.js';
import { createNotificationIfAllowed } from '../notifications/notifications.service.js';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/AppError.js';
import { env } from '../../config/env.js';
import { socketManager } from '../../sockets/emitter.js';

export async function formatMessage(msgDoc: IMessage | Record<string, unknown>, viewerId?: string) {
  const raw =
    'toObject' in msgDoc && typeof msgDoc.toObject === 'function' ? msgDoc.toObject() : msgDoc;

  const senderObj = raw.senderId as IUser | Types.ObjectId;
  let senderUser: IUser | null = null;
  if (senderObj && typeof senderObj === 'object' && 'displayName' in senderObj) {
    senderUser = senderObj as IUser;
  } else {
    senderUser = (await UserModel.findById(raw.senderId).lean()) as unknown as IUser | null;
  }

  const senderIdStr = senderUser ? String(senderUser._id) : String(raw.senderId);
  const isDeletedForEveryone = Boolean(raw.isDeletedForEveryone);

  // Format attachments if not deleted
  let attachmentsFormatted: ReturnType<typeof formatAttachment>[] = [];
  if (!isDeletedForEveryone && Array.isArray(raw.attachments) && raw.attachments.length > 0) {
    const first = raw.attachments[0];
    if (first && typeof first === 'object' && 'originalName' in first) {
      attachmentsFormatted = (raw.attachments as IAttachment[]).map((a) => formatAttachment(a));
    } else {
      const docs = await AttachmentModel.find({ _id: { $in: raw.attachments } }).lean();
      attachmentsFormatted = docs.map((a) => formatAttachment(a));
    }
  }

  // Format replyTo preview
  let replyToFormatted: {
    _id: string;
    content: string;
    type: string;
    isDeletedForEveryone: boolean;
    sender: { _id: string; displayName: string };
  } | null = null;

  if (raw.replyTo) {
    let replyDoc = raw.replyTo as Record<string, unknown>;
    if (!('content' in replyDoc)) {
      replyDoc = (await MessageModel.findById(raw.replyTo)
        .populate('senderId', 'displayName username isDeleted')
        .lean()) as unknown as Record<string, unknown>;
    }
    if (replyDoc) {
      const replySender = replyDoc.senderId as IUser | Types.ObjectId;
      let replySenderName = 'User';
      let replySenderId = String(replySender);
      if (replySender && typeof replySender === 'object' && 'displayName' in replySender) {
        replySenderName = replySender.isDeleted ? 'Deleted Account' : replySender.displayName;
        replySenderId = String(replySender._id);
      } else {
        const u = await UserModel.findById(replySender).select('displayName isDeleted').lean();
        if (u) {
          replySenderName = u.isDeleted ? 'Deleted Account' : u.displayName;
          replySenderId = String(u._id);
        }
      }

      replyToFormatted = {
        _id: String(replyDoc._id),
        content: replyDoc.isDeletedForEveryone
          ? 'This message was deleted'
          : String(replyDoc.content || (replyDoc.type === 'attachment' ? 'Attachment' : '')),
        type: String(replyDoc.type || 'text'),
        isDeletedForEveryone: Boolean(replyDoc.isDeletedForEveryone),
        sender: {
          _id: replySenderId,
          displayName: replySenderName,
        },
      };
    }
  }

  const deliveredTo = ((raw.deliveredTo as Types.ObjectId[]) || []).map(String);
  const readBy = ((raw.readBy as Types.ObjectId[]) || []).map(String);

  const otherDelivered = deliveredTo.filter((id) => id !== senderIdStr);
  const otherRead = readBy.filter((id) => id !== senderIdStr);

  let status: 'sent' | 'delivered' | 'read' = 'sent';
  if (otherRead.length > 0) {
    status = 'read';
  } else if (otherDelivered.length > 0) {
    status = 'delivered';
  }

  const reactions = isDeletedForEveryone
    ? []
    : ((raw.reactions as Array<{ emoji: string; userIds: Types.ObjectId[] }>) || [])
        .filter((r) => r.userIds && r.userIds.length > 0)
        .map((r) => ({
          emoji: r.emoji,
          userIds: r.userIds.map(String),
          count: r.userIds.length,
        }));

  return {
    _id: String(raw._id),
    conversationId: String(raw.conversationId),
    senderId: senderIdStr,
    sender: senderUser
      ? sanitizePublicUser(senderUser, viewerId)
      : {
          _id: senderIdStr,
          displayName: 'Unknown User',
          username: 'unknown',
          avatar: null,
          isOnline: false,
          lastSeenAt: null,
        },
    clientMessageId: (raw.clientMessageId as string | undefined) || undefined,
    type: raw.type as 'text' | 'attachment' | 'system',
    content: isDeletedForEveryone ? 'This message was deleted' : String(raw.content || ''),
    attachments: attachmentsFormatted,
    replyTo: replyToFormatted,
    reactions,
    deliveredTo,
    readBy,
    status,
    isDeletedForEveryone,
    deletedAt: raw.deletedAt ?? null,
    editedAt: raw.editedAt ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function listConversationMessages(
  userId: string,
  conversationId: string,
  cursor?: string,
  limit = env.DEFAULT_PAGE_SIZE,
) {
  const conversation = await ConversationModel.findOne({
    _id: conversationId,
    'participants.userId': new Types.ObjectId(userId),
  }).lean();

  if (!conversation) {
    throw new ForbiddenError('You are not a participant of this conversation');
  }

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const query: Record<string, unknown> = {
    conversationId: new Types.ObjectId(conversationId),
    deletedFor: { $ne: new Types.ObjectId(userId) },
  };

  if (cursor && Types.ObjectId.isValid(cursor)) {
    query._id = { $lt: new Types.ObjectId(cursor) };
  }

  const docs = await MessageModel.find(query)
    .sort({ _id: -1 })
    .limit(safeLimit + 1)
    .populate('senderId')
    .populate('attachments')
    .populate({
      path: 'replyTo',
      populate: { path: 'senderId', select: 'displayName username isDeleted' },
    })
    .lean();

  const hasMore = docs.length > safeLimit;
  const slice = hasMore ? docs.slice(0, safeLimit) : docs;
  const nextCursor = hasMore ? String(slice[slice.length - 1]._id) : null;

  // Return in chronological order (oldest -> newest within the page)
  const chronological = slice.reverse();
  const messages = await Promise.all(
    chronological.map((m) => formatMessage(m as unknown as IMessage, userId)),
  );

  return {
    messages,
    nextCursor,
    hasMore,
  };
}

export async function sendMessage(params: {
  senderId: string;
  conversationId: string;
  content?: string;
  clientMessageId?: string;
  replyTo?: string | null;
  attachmentIds?: string[];
  type?: 'text' | 'attachment' | 'system';
}) {
  const conversation = await ConversationModel.findById(params.conversationId).populate(
    'participants.userId',
  );

  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  const senderParticipant = conversation.participants.find((p) => {
    const uid =
      typeof p.userId === 'object' && '_id' in p.userId
        ? String(p.userId._id)
        : String(p.userId);
    return uid === String(params.senderId);
  });

  if (!senderParticipant) {
    throw new ForbiddenError('You are not a participant of this conversation');
  }

  // If direct conversation, check block status between participants
  if (conversation.type === 'direct') {
    const otherParticipant = conversation.participants.find((p) => {
      const uid =
        typeof p.userId === 'object' && '_id' in p.userId
          ? String(p.userId._id)
          : String(p.userId);
      return uid !== String(params.senderId);
    });

    if (otherParticipant) {
      const otherUid =
        typeof otherParticipant.userId === 'object' && '_id' in otherParticipant.userId
          ? String(otherParticipant.userId._id)
          : String(otherParticipant.userId);

      const [senderUser, recipientUser] = await Promise.all([
        UserModel.findById(params.senderId).select('blockedUsers').lean(),
        UserModel.findById(otherUid).select('blockedUsers isDeleted').lean(),
      ]);

      if (recipientUser?.isDeleted) {
        throw new ForbiddenError('Cannot send messages to a deleted account', 'RECIPIENT_DELETED');
      }

      if ((senderUser?.blockedUsers || []).some((id) => String(id) === otherUid)) {
        throw new ForbiddenError(
          'You have blocked this user. Unblock them to send messages.',
          'USER_BLOCKED',
        );
      }

      if ((recipientUser?.blockedUsers || []).some((id) => String(id) === String(params.senderId))) {
        throw new ForbiddenError('You cannot send messages to this user.', 'BLOCKED_BY_USER');
      }
    }
  }

  const trimmedContent = (params.content ?? '').trim();
  const attachmentIds = (params.attachmentIds || []).filter((id) => Types.ObjectId.isValid(id));

  if (!trimmedContent && attachmentIds.length === 0) {
    throw new AppError('Message content or attachment is required', 400, 'EMPTY_MESSAGE');
  }

  if (trimmedContent.length > env.MAX_MESSAGE_LENGTH) {
    throw new AppError(
      `Message exceeds maximum length of ${env.MAX_MESSAGE_LENGTH} characters`,
      400,
      'MESSAGE_TOO_LONG',
    );
  }

  // Idempotency check: if clientMessageId was already persisted in this conversation, return existing
  if (params.clientMessageId) {
    const existingMsg = await MessageModel.findOne({
      conversationId: conversation._id,
      clientMessageId: params.clientMessageId,
    })
      .populate('senderId')
      .populate('attachments')
      .populate({
        path: 'replyTo',
        populate: { path: 'senderId', select: 'displayName username isDeleted' },
      });

    if (existingMsg) {
      const formatted = await formatMessage(existingMsg, params.senderId);
      const convFormatted = await formatConversationForUser(conversation, params.senderId);
      return { message: formatted, conversation: convFormatted, deduplicated: true };
    }
  }

  // Verify attachments belong to this conversation
  if (attachmentIds.length > 0) {
    const validCount = await AttachmentModel.countDocuments({
      _id: { $in: attachmentIds.map((id) => new Types.ObjectId(id)) },
      conversationId: conversation._id,
    });
    if (validCount !== attachmentIds.length) {
      throw new ForbiddenError('One or more attachments do not belong to this conversation');
    }
  }

  // Verify replyTo belongs to this conversation
  if (params.replyTo) {
    const replyTarget = await MessageModel.findOne({
      _id: params.replyTo,
      conversationId: conversation._id,
    }).lean();
    if (!replyTarget) {
      throw new AppError('Referenced reply message was not found in this conversation', 400);
    }
  }

  const msgType =
    params.type || (attachmentIds.length > 0 && !trimmedContent ? 'attachment' : 'text');

  const created = await MessageModel.create({
    conversationId: conversation._id,
    senderId: new Types.ObjectId(params.senderId),
    ...(params.clientMessageId ? { clientMessageId: params.clientMessageId } : {}),
    type: msgType,
    content: trimmedContent,
    attachments: attachmentIds.map((id) => new Types.ObjectId(id)),
    replyTo: params.replyTo ? new Types.ObjectId(params.replyTo) : null,
    deliveredTo: [new Types.ObjectId(params.senderId)],
    readBy: [new Types.ObjectId(params.senderId)],
  });

  // Update conversation metadata & participant unread counts
  const previewText =
    trimmedContent ||
    (attachmentIds.length > 0 ? `📎 Sent ${attachmentIds.length} attachment(s)` : 'New message');

  conversation.lastMessage = {
    messageId: created._id,
    contentPreview: previewText.slice(0, 140),
    senderId: new Types.ObjectId(params.senderId),
    type: msgType,
    createdAt: created.createdAt,
  };
  conversation.lastActivityAt = created.createdAt;

  for (const part of conversation.participants) {
    const uid =
      typeof part.userId === 'object' && '_id' in part.userId
        ? String(part.userId._id)
        : String(part.userId);
    if (uid === String(params.senderId)) {
      part.lastReadMessageId = created._id;
      part.lastReadAt = created.createdAt;
      part.unreadCount = 0;
    } else {
      part.unreadCount = (part.unreadCount || 0) + 1;
      part.isArchived = false;
    }
  }

  await conversation.save();

  await created.populate('senderId');
  await created.populate('attachments');
  if (created.replyTo) {
    await created.populate({
      path: 'replyTo',
      populate: { path: 'senderId', select: 'displayName username isDeleted' },
    });
  }

  const formattedMessage = await formatMessage(created, params.senderId);
  const senderDisplayName = formattedMessage.sender.displayName;

  // Emit to each participant with their personalized conversation object
  for (const part of conversation.participants) {
    const uid =
      typeof part.userId === 'object' && '_id' in part.userId
        ? String(part.userId._id)
        : String(part.userId);

    const personalizedConv = await formatConversationForUser(conversation, uid);
    socketManager.emitToUser(uid, 'message:new', {
      message: formattedMessage,
      conversation: personalizedConv,
    });

    if (uid !== String(params.senderId) && msgType !== 'system') {
      const title =
        conversation.type === 'group'
          ? `${senderDisplayName} in ${conversation.groupName || 'Group'}`
          : senderDisplayName;

      await createNotificationIfAllowed({
        userId: uid,
        type: 'message',
        title,
        body: previewText,
        conversationId: String(conversation._id),
        actorId: params.senderId,
        isConversationMuted: part.isMuted,
      });
    }
  }

  const senderConv = await formatConversationForUser(conversation, params.senderId);
  return { message: formattedMessage, conversation: senderConv, deduplicated: false };
}

export async function acknowledgeMessageDelivered(
  userId: string,
  conversationId: string,
  messageId: string,
) {
  const isMember = await ConversationModel.exists({
    _id: conversationId,
    'participants.userId': new Types.ObjectId(userId),
  });
  if (!isMember) {
    throw new ForbiddenError('Not authorized for this conversation');
  }

  const msg = await MessageModel.findOneAndUpdate(
    {
      _id: messageId,
      conversationId,
      senderId: { $ne: new Types.ObjectId(userId) },
      deliveredTo: { $ne: new Types.ObjectId(userId) },
    },
    {
      $addToSet: { deliveredTo: new Types.ObjectId(userId) },
    },
    { new: true },
  ).lean();

  if (msg) {
    const payload = {
      messageId: String(msg._id),
      conversationId: String(msg.conversationId),
      userId: String(userId),
      status: 'delivered' as const,
    };
    socketManager.emitToConversation(String(msg.conversationId), 'message:delivered', payload);
    socketManager.emitToUser(String(msg.senderId), 'message:delivered', payload);
  }
}

export async function markConversationRead(
  userId: string,
  conversationId: string,
  upToMessageId?: string,
) {
  const conversation = await ConversationModel.findById(conversationId).populate(
    'participants.userId',
  );
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  const participant = conversation.participants.find((p) => {
    const uid =
      typeof p.userId === 'object' && '_id' in p.userId
        ? String(p.userId._id)
        : String(p.userId);
    return uid === String(userId);
  });

  if (!participant) {
    throw new ForbiddenError('Not a participant of this conversation');
  }

  const latestMsg = upToMessageId
    ? await MessageModel.findOne({ _id: upToMessageId, conversationId }).lean()
    : await MessageModel.findOne({ conversationId }).sort({ _id: -1 }).lean();

  const readAt = new Date();
  participant.unreadCount = 0;
  participant.lastReadAt = readAt;
  if (latestMsg) {
    participant.lastReadMessageId = latestMsg._id;
  }
  await conversation.save();

  // Check viewer's privacySettings.readReceipts
  const viewer = await UserModel.findById(userId).select('privacySettings').lean();
  const sendReceipts = viewer?.privacySettings?.readReceipts !== false;

  const filter: Record<string, unknown> = {
    conversationId: conversation._id,
    senderId: { $ne: new Types.ObjectId(userId) },
  };
  if (latestMsg) {
    filter._id = { $lte: latestMsg._id };
  }

  if (sendReceipts) {
    await MessageModel.updateMany(filter, {
      $addToSet: {
        deliveredTo: new Types.ObjectId(userId),
        readBy: new Types.ObjectId(userId),
      },
    });

    const receiptPayload = {
      conversationId: String(conversation._id),
      userId: String(userId),
      lastReadMessageId: latestMsg ? String(latestMsg._id) : null,
      readAt: readAt.toISOString(),
    };

    for (const part of conversation.participants) {
      const uid =
        typeof part.userId === 'object' && '_id' in part.userId
          ? String(part.userId._id)
          : String(part.userId);
      socketManager.emitToUser(uid, 'message:read', receiptPayload);
    }
  } else {
    // Still mark delivered even if read receipts are private
    await MessageModel.updateMany(filter, {
      $addToSet: {
        deliveredTo: new Types.ObjectId(userId),
      },
    });
  }

  return {
    conversationId: String(conversation._id),
    lastReadMessageId: latestMsg ? String(latestMsg._id) : null,
    readAt: readAt.toISOString(),
  };
}

export async function editMessage(userId: string, messageId: string, newContent: string) {
  const trimmed = newContent.trim();
  if (!trimmed) {
    throw new AppError('Edited message cannot be empty', 400, 'EMPTY_MESSAGE');
  }
  if (trimmed.length > env.MAX_MESSAGE_LENGTH) {
    throw new AppError('Message exceeds maximum length', 400, 'MESSAGE_TOO_LONG');
  }

  const message = await MessageModel.findById(messageId);
  if (!message) {
    throw new NotFoundError('Message not found');
  }

  if (String(message.senderId) !== String(userId)) {
    throw new ForbiddenError('You can only edit your own messages');
  }

  if (message.isDeletedForEveryone || message.type === 'system') {
    throw new AppError('This message cannot be edited', 400, 'CANNOT_EDIT_MESSAGE');
  }

  message.content = trimmed;
  message.editedAt = new Date();
  await message.save();

  const conversation = await ConversationModel.findById(message.conversationId);
  if (
    conversation &&
    conversation.lastMessage &&
    String(conversation.lastMessage.messageId) === String(message._id)
  ) {
    conversation.lastMessage.contentPreview = trimmed.slice(0, 140);
    await conversation.save();
  }

  await message.populate('senderId');
  await message.populate('attachments');
  if (message.replyTo) {
    await message.populate({
      path: 'replyTo',
      populate: { path: 'senderId', select: 'displayName username isDeleted' },
    });
  }

  const formatted = await formatMessage(message, userId);

  if (conversation) {
    for (const part of conversation.participants) {
      socketManager.emitToUser(String(part.userId), 'message:updated', { message: formatted });
    }
  }

  return formatted;
}

export async function deleteMessage(
  userId: string,
  messageId: string,
  mode: 'self' | 'everyone' = 'everyone',
) {
  const message = await MessageModel.findById(messageId);
  if (!message) {
    throw new NotFoundError('Message not found');
  }

  const conversation = await ConversationModel.findById(message.conversationId);
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  const participant = conversation.participants.find(
    (p) => String(p.userId) === String(userId),
  );
  if (!participant) {
    throw new ForbiddenError('You are not a participant of this conversation');
  }

  if (mode === 'self') {
    await MessageModel.findByIdAndUpdate(messageId, {
      $addToSet: { deletedFor: new Types.ObjectId(userId) },
    });

    const payload = {
      messageId: String(message._id),
      conversationId: String(conversation._id),
      mode: 'self' as const,
      isDeletedForEveryone: message.isDeletedForEveryone,
    };
    socketManager.emitToUser(userId, 'message:deleted', payload);
    return payload;
  }

  // mode === 'everyone': must be sender OR group admin
  const isSender = String(message.senderId) === String(userId);
  const isGroupAdmin = conversation.type === 'group' && participant.role === 'admin';

  if (!isSender && !isGroupAdmin) {
    throw new ForbiddenError('You can only delete your own messages for everyone');
  }

  message.isDeletedForEveryone = true;
  message.deletedAt = new Date();
  message.content = '';
  message.attachments = [];
  message.reactions = [];
  await message.save();

  if (
    conversation.lastMessage &&
    String(conversation.lastMessage.messageId) === String(message._id)
  ) {
    conversation.lastMessage.contentPreview = 'This message was deleted';
    await conversation.save();
  }

  const payload = {
    messageId: String(message._id),
    conversationId: String(conversation._id),
    mode: 'everyone' as const,
    isDeletedForEveryone: true,
    deletedAt: message.deletedAt.toISOString(),
  };

  for (const part of conversation.participants) {
    socketManager.emitToUser(String(part.userId), 'message:deleted', payload);
  }

  return payload;
}

export async function toggleMessageReaction(
  userId: string,
  messageId: string,
  emoji: string,
  forceAction?: 'add' | 'remove',
) {
  if (!ALLOWED_REACTIONS.includes(emoji as (typeof ALLOWED_REACTIONS)[number])) {
    throw new AppError('Unsupported reaction emoji', 400, 'INVALID_REACTION');
  }

  const message = await MessageModel.findById(messageId);
  if (!message || message.isDeletedForEveryone) {
    throw new NotFoundError('Message not found');
  }

  const conversation = await ConversationModel.findOne({
    _id: message.conversationId,
    'participants.userId': new Types.ObjectId(userId),
  }).lean();

  if (!conversation) {
    throw new ForbiddenError('You are not a participant of this conversation');
  }

  let reactionEntry = message.reactions.find((r) => r.emoji === emoji);
  const userObjId = new Types.ObjectId(userId);

  if (!reactionEntry) {
    if (forceAction !== 'remove') {
      message.reactions.push({
        emoji,
        userIds: [userObjId],
      });
    }
  } else {
    const alreadyReacted = reactionEntry.userIds.some((id) => String(id) === String(userId));
    if (forceAction === 'add' && !alreadyReacted) {
      reactionEntry.userIds.push(userObjId);
    } else if (forceAction === 'remove' || alreadyReacted) {
      reactionEntry.userIds = reactionEntry.userIds.filter(
        (id) => String(id) !== String(userId),
      );
    } else {
      reactionEntry.userIds.push(userObjId);
    }
  }

  message.reactions = message.reactions.filter((r) => r.userIds.length > 0);
  await message.save();

  const reactionsFormatted = message.reactions.map((r) => ({
    emoji: r.emoji,
    userIds: r.userIds.map(String),
    count: r.userIds.length,
  }));

  const payload = {
    messageId: String(message._id),
    conversationId: String(message.conversationId),
    reactions: reactionsFormatted,
  };

  for (const part of conversation.participants) {
    socketManager.emitToUser(String(part.userId), 'reaction:updated', payload);
  }

  return payload;
}

export async function searchConversationMessages(
  userId: string,
  conversationId: string,
  query: string,
) {
  const isMember = await ConversationModel.exists({
    _id: conversationId,
    'participants.userId': new Types.ObjectId(userId),
  });

  if (!isMember) {
    throw new ForbiddenError('You are not authorized to search this conversation');
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');

  const docs = await MessageModel.find({
    conversationId: new Types.ObjectId(conversationId),
    isDeletedForEveryone: false,
    deletedFor: { $ne: new Types.ObjectId(userId) },
    type: { $ne: 'system' },
    content: regex,
  })
    .sort({ createdAt: -1 })
    .limit(40)
    .populate('senderId', 'displayName username avatar isDeleted')
    .lean();

  return Promise.all(docs.map((d) => formatMessage(d as unknown as IMessage, userId)));
}
