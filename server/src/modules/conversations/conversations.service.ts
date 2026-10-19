import { Types } from 'mongoose';
import {
  ConversationModel,
  IConversation,
  buildDirectPairKey,
} from './conversation.model.js';
import { UserModel, sanitizePublicUser, IUser } from '../users/user.model.js';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/AppError.js';
import { socketManager } from '../../sockets/emitter.js';

export async function formatConversationForUser(
  conv: IConversation | Record<string, unknown>,
  viewerId: string,
) {
  const raw = 'toObject' in conv && typeof conv.toObject === 'function' ? conv.toObject() : conv;
  const participantsRaw = (raw.participants || []) as Array<{
    userId: IUser | Types.ObjectId;
    role: 'admin' | 'member';
    joinedAt: Date;
    lastReadMessageId: Types.ObjectId | null;
    lastReadAt: Date | null;
    unreadCount: number;
    isMuted: boolean;
    isPinned: boolean;
    isArchived: boolean;
  }>;

  // Ensure participant user docs are populated
  const needsPopulation = participantsRaw.some(
    (p) => !p.userId || typeof (p.userId as IUser).displayName !== 'string',
  );

  let userMap = new Map<string, IUser>();
  if (needsPopulation) {
    const ids = participantsRaw.map((p) =>
      typeof p.userId === 'object' && '_id' in p.userId ? p.userId._id : p.userId,
    );
    const users = await UserModel.find({ _id: { $in: ids } }).lean();
    for (const u of users) {
      userMap.set(String(u._id), u as unknown as IUser);
    }
  }

  const participants = participantsRaw.map((p) => {
    const uid =
      typeof p.userId === 'object' && '_id' in p.userId
        ? String(p.userId._id)
        : String(p.userId);
    const userDoc =
      typeof p.userId === 'object' && 'displayName' in p.userId
        ? (p.userId as IUser)
        : userMap.get(uid) || { _id: new Types.ObjectId(uid), displayName: 'Unknown', username: 'unknown' };

    return {
      user: sanitizePublicUser(userDoc, viewerId),
      role: p.role,
      joinedAt: p.joinedAt,
      lastReadMessageId: p.lastReadMessageId ? String(p.lastReadMessageId) : null,
      lastReadAt: p.lastReadAt,
    };
  });

  const myRecord = participantsRaw.find((p) => {
    const uid =
      typeof p.userId === 'object' && '_id' in p.userId
        ? String(p.userId._id)
        : String(p.userId);
    return uid === String(viewerId);
  });

  const peerParticipant =
    raw.type === 'direct'
      ? participants.find((p) => p.user._id !== String(viewerId))?.user ||
        participants[0]?.user ||
        null
      : null;

  const lastMessage = raw.lastMessage
    ? {
        messageId: String((raw.lastMessage as { messageId: Types.ObjectId }).messageId),
        contentPreview: (raw.lastMessage as { contentPreview: string }).contentPreview,
        senderId: String((raw.lastMessage as { senderId: Types.ObjectId }).senderId),
        type: (raw.lastMessage as { type: string }).type,
        createdAt: (raw.lastMessage as { createdAt: Date }).createdAt,
      }
    : null;

  return {
    _id: String(raw._id),
    type: raw.type as 'direct' | 'group',
    groupName: (raw.groupName as string | null) ?? null,
    groupDescription: (raw.groupDescription as string) ?? '',
    groupAvatar: (raw.groupAvatar as string | null) ?? null,
    createdBy: String(raw.createdBy),
    peer: peerParticipant,
    participants,
    mySettings: {
      role: myRecord?.role ?? 'member',
      unreadCount: myRecord?.unreadCount ?? 0,
      isMuted: Boolean(myRecord?.isMuted),
      isPinned: Boolean(myRecord?.isPinned),
      isArchived: Boolean(myRecord?.isArchived),
      lastReadMessageId: myRecord?.lastReadMessageId ? String(myRecord.lastReadMessageId) : null,
      lastReadAt: myRecord?.lastReadAt ?? null,
    },
    lastMessage,
    lastActivityAt: raw.lastActivityAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function listUserConversations(userId: string) {
  const conversations = await ConversationModel.find({
    'participants.userId': new Types.ObjectId(userId),
  })
    .populate('participants.userId')
    .sort({ lastActivityAt: -1 })
    .lean();

  const formatted = await Promise.all(
    conversations.map((c) => formatConversationForUser(c as unknown as IConversation, userId)),
  );

  // Sort pinned conversations first (for this user), then by lastActivityAt descending
  formatted.sort((a, b) => {
    if (a.mySettings.isPinned !== b.mySettings.isPinned) {
      return a.mySettings.isPinned ? -1 : 1;
    }
    return new Date(b.lastActivityAt as string).getTime() - new Date(a.lastActivityAt as string).getTime();
  });

  return formatted;
}

export async function getOrCreateDirectConversation(viewerId: string, participantId: string) {
  if (String(viewerId) === String(participantId)) {
    throw new AppError('Cannot start a direct conversation with yourself', 400, 'SELF_CONVERSATION');
  }

  const [viewer, target] = await Promise.all([
    UserModel.findById(viewerId).select('blockedUsers isDeleted').lean(),
    UserModel.findById(participantId).select('blockedUsers isDeleted').lean(),
  ]);

  if (!target || target.isDeleted) {
    throw new NotFoundError('The requested user was not found or is unavailable');
  }

  const viewerBlockedTarget = (viewer?.blockedUsers || []).some(
    (id) => String(id) === String(participantId),
  );
  if (viewerBlockedTarget) {
    throw new ForbiddenError('You have blocked this user. Unblock them to start a conversation.', 'USER_BLOCKED');
  }

  const targetBlockedViewer = (target.blockedUsers || []).some(
    (id) => String(id) === String(viewerId),
  );
  if (targetBlockedViewer) {
    throw new ForbiddenError('Cannot start a conversation with this user.', 'BLOCKED_BY_USER');
  }

  const pairKey = buildDirectPairKey(viewerId, participantId);

  let conversation = await ConversationModel.findOne({
    type: 'direct',
    directPairKey: pairKey,
  }).populate('participants.userId');

  let createdNew = false;

  if (!conversation) {
    try {
      conversation = await ConversationModel.create({
        type: 'direct',
        directPairKey: pairKey,
        createdBy: new Types.ObjectId(viewerId),
        participants: [
          {
            userId: new Types.ObjectId(viewerId),
            role: 'member',
            joinedAt: new Date(),
            unreadCount: 0,
            isMuted: false,
            isPinned: false,
            isArchived: false,
          },
          {
            userId: new Types.ObjectId(participantId),
            role: 'member',
            joinedAt: new Date(),
            unreadCount: 0,
            isMuted: false,
            isPinned: false,
            isArchived: false,
          },
        ],
        lastActivityAt: new Date(),
      });
      await conversation.populate('participants.userId');
      createdNew = true;
    } catch (err) {
      // Handle race condition where both users created the direct conversation simultaneously
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: number }).code === 11000
      ) {
        conversation = await ConversationModel.findOne({
          type: 'direct',
          directPairKey: pairKey,
        }).populate('participants.userId');
      } else {
        throw err;
      }
    }
  }

  if (!conversation) {
    throw new AppError('Could not load conversation', 500);
  }

  const formattedForViewer = await formatConversationForUser(conversation, viewerId);

  if (createdNew) {
    const formattedForPeer = await formatConversationForUser(conversation, participantId);
    socketManager.emitToUser(participantId, 'conversation:updated', {
      conversation: formattedForPeer,
    });
  }

  return { conversation: formattedForViewer, createdNew };
}

export async function getAuthorizedConversation(userId: string, conversationId: string) {
  const conversation = await ConversationModel.findById(conversationId).populate(
    'participants.userId',
  );

  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  const isMember = conversation.participants.some((p) => {
    const uid =
      typeof p.userId === 'object' && '_id' in p.userId
        ? String(p.userId._id)
        : String(p.userId);
    return uid === String(userId);
  });

  if (!isMember) {
    throw new ForbiddenError('You are not a participant of this conversation');
  }

  return formatConversationForUser(conversation, userId);
}

export async function updateMyConversationSettings(
  userId: string,
  conversationId: string,
  updates: {
    isMuted?: boolean;
    isPinned?: boolean;
    isArchived?: boolean;
  },
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
    throw new ForbiddenError('You are not a participant of this conversation');
  }

  if (updates.isMuted !== undefined) participant.isMuted = updates.isMuted;
  if (updates.isPinned !== undefined) participant.isPinned = updates.isPinned;
  if (updates.isArchived !== undefined) participant.isArchived = updates.isArchived;

  await conversation.save();

  return formatConversationForUser(conversation, userId);
}
