import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../modules/auth/jwt.js';
import { SessionModel } from '../modules/auth/session.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { ConversationModel } from '../modules/conversations/conversation.model.js';
import {
  sendMessage,
  editMessage,
  deleteMessage,
  markConversationRead,
  acknowledgeMessageDelivered,
  toggleMessageReaction,
} from '../modules/messages/messages.service.js';
import { socketManager } from './emitter.js';
import { objectIdSchema } from '../middleware/validate.js';
import { AppError } from '../shared/errors/AppError.js';
import { logger } from '../shared/utils/logger.js';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    sessionId: string;
    displayName: string;
    username: string;
  };
}

// Track active typing timers per `${conversationId}:${userId}` so stale indicators always expire
const typingTimers = new Map<string, NodeJS.Timeout>();
const socketTypingConversations = new Map<string, Set<string>>();

const joinLeaveSchema = z.object({
  conversationId: objectIdSchema,
});

const socketSendMessageSchema = z.object({
  conversationId: objectIdSchema,
  content: z.string().max(4000).optional().default(''),
  clientMessageId: z.string().trim().max(100).optional(),
  replyTo: objectIdSchema.nullable().optional(),
  attachmentIds: z.array(objectIdSchema).max(10).optional(),
});

const socketEditMessageSchema = z.object({
  messageId: objectIdSchema,
  content: z.string().trim().min(1).max(4000),
});

const socketDeleteMessageSchema = z.object({
  messageId: objectIdSchema,
  mode: z.enum(['self', 'everyone']).optional().default('everyone'),
});

const socketReadSchema = z.object({
  conversationId: objectIdSchema,
  messageId: objectIdSchema.optional(),
});

const socketDeliveredSchema = z.object({
  conversationId: objectIdSchema,
  messageId: objectIdSchema,
});

const socketReactionSchema = z.object({
  messageId: objectIdSchema,
  emoji: z.string().trim().min(1).max(16),
});

function clearUserTyping(userId: string, displayName: string, conversationId: string, io: SocketIOServer) {
  const key = `${conversationId}:${userId}`;
  const timer = typingTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    typingTimers.delete(key);
  }
  io.to(`conversation:${conversationId}`).emit('typing:updated', {
    conversationId,
    userId,
    displayName,
    isTyping: false,
  });
}

function handleSocketError(
  socket: Socket,
  err: unknown,
  ack?: (res: Record<string, unknown>) => void,
) {
  let code = 'SOCKET_ERROR';
  let message = 'Operation failed';

  if (err instanceof AppError) {
    code = err.code;
    message = err.message;
  } else if (err instanceof z.ZodError) {
    code = 'VALIDATION_ERROR';
    message = err.issues[0]?.message || 'Invalid event payload';
  } else if (err instanceof Error) {
    message = err.message;
  }

  socket.emit('error:occurred', { code, message });
  if (typeof ack === 'function') {
    ack({ success: false, error: { code, message } });
  }
}

export function initializeSocketGateway(httpServer: HttpServer): SocketIOServer {
  const allowedOrigins = env.CLIENT_ORIGIN.split(',').map((o) => o.trim());

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  socketManager.setServer(io);

  // Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers?.authorization;
      const rawToken =
        socket.handshake.auth?.token ||
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');

      if (!rawToken || typeof rawToken !== 'string') {
        return next(new Error('Authentication required'));
      }

      const payload = verifyAccessToken(rawToken);
      const session = await SessionModel.findById(payload.sid).lean();
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        return next(new Error('Session expired or revoked'));
      }

      const user = await UserModel.findById(payload.sub)
        .select('_id displayName username isDeleted')
        .lean();

      if (!user || user.isDeleted) {
        return next(new Error('User account is inactive'));
      }

      socket.data.userId = String(user._id);
      socket.data.sessionId = String(session._id);
      socket.data.displayName = user.displayName;
      socket.data.username = user.username;
      next();
    } catch {
      next(new Error('Invalid authentication credentials'));
    }
  });

  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const { userId, displayName } = socket.data;

    // 1. Synchronously join personal user room & register connection before any async work
    socket.join(`user:${userId}`);
    socketTypingConversations.set(socket.id, new Set());
    const transitionedToOnline = socketManager.registerConnection(userId, socket.id);

    // 2. Asynchronously auto-join user's existing authorized conversations & broadcast presence
    void (async () => {
      try {
        const userConvs = await ConversationModel.find({
          'participants.userId': new Types.ObjectId(userId),
        })
          .select('_id')
          .lean();

        for (const c of userConvs) {
          socket.join(`conversation:${String(c._id)}`);
        }
      } catch (err) {
        logger.error('Failed to join initial conversation rooms', {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (transitionedToOnline) {
        try {
          const updatedUser = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { isOnline: true, lastSeenAt: new Date() } },
            { new: true },
          ).lean();

          if (updatedUser) {
            const showOnline = updatedUser.privacySettings?.onlineVisibility !== 'nobody';
            const showLastSeen = updatedUser.privacySettings?.lastSeenVisibility !== 'nobody';

            io.emit('presence:updated', {
              userId,
              isOnline: showOnline && updatedUser.availability !== 'offline',
              availability: showOnline ? updatedUser.availability : 'offline',
              lastSeenAt: showLastSeen ? updatedUser.lastSeenAt.toISOString() : null,
            });
          }
        } catch (err) {
          logger.error('Failed to broadcast online presence', {
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    // Event: conversation:join
    socket.on('conversation:join', async (payload: unknown, ack?: (res: Record<string, unknown>) => void) => {
      try {
        const { conversationId } = joinLeaveSchema.parse(payload);
        const isMember = await ConversationModel.exists({
          _id: conversationId,
          'participants.userId': new Types.ObjectId(userId),
        });

        if (!isMember) {
          throw new AppError('You are not authorized to join this conversation', 403, 'FORBIDDEN');
        }

        socket.join(`conversation:${conversationId}`);
        socketManager.setActiveConversation(socket.id, conversationId);

        socket.emit('conversation:joined', { conversationId });
        if (typeof ack === 'function') {
          ack({ success: true, data: { conversationId } });
        }
      } catch (err) {
        handleSocketError(socket, err, ack);
      }
    });

    // Event: conversation:leave
    socket.on('conversation:leave', async (payload: unknown, ack?: (res: Record<string, unknown>) => void) => {
      try {
        const { conversationId } = joinLeaveSchema.parse(payload);
        socket.leave(`conversation:${conversationId}`);
        socketManager.setActiveConversation(socket.id, null);
        clearUserTyping(userId, displayName, conversationId, io);
        socketTypingConversations.get(socket.id)?.delete(conversationId);

        if (typeof ack === 'function') {
          ack({ success: true, data: { conversationId } });
        }
      } catch (err) {
        handleSocketError(socket, err, ack);
      }
    });

    // Event: message:send
    socket.on('message:send', async (payload: unknown, ack?: (res: Record<string, unknown>) => void) => {
      try {
        const parsed = socketSendMessageSchema.parse(payload);
        clearUserTyping(userId, displayName, parsed.conversationId, io);

        const result = await sendMessage({
          senderId: userId,
          conversationId: parsed.conversationId,
          content: parsed.content,
          clientMessageId: parsed.clientMessageId,
          replyTo: parsed.replyTo,
          attachmentIds: parsed.attachmentIds,
        });

        if (typeof ack === 'function') {
          ack({ success: true, data: result });
        }
      } catch (err) {
        handleSocketError(socket, err, ack);
      }
    });

    // Event: message:delivered
    socket.on('message:delivered', async (payload: unknown, ack?: (res: Record<string, unknown>) => void) => {
      try {
        const { conversationId, messageId } = socketDeliveredSchema.parse(payload);
        await acknowledgeMessageDelivered(userId, conversationId, messageId);
        if (typeof ack === 'function') {
          ack({ success: true });
        }
      } catch (err) {
        handleSocketError(socket, err, ack);
      }
    });

    // Event: message:read
    socket.on('message:read', async (payload: unknown, ack?: (res: Record<string, unknown>) => void) => {
      try {
        const { conversationId, messageId } = socketReadSchema.parse(payload);
        const res = await markConversationRead(userId, conversationId, messageId);
        if (typeof ack === 'function') {
          ack({ success: true, data: res });
        }
      } catch (err) {
        handleSocketError(socket, err, ack);
      }
    });

    // Event: message:edit
    socket.on('message:edit', async (payload: unknown, ack?: (res: Record<string, unknown>) => void) => {
      try {
        const { messageId, content } = socketEditMessageSchema.parse(payload);
        const message = await editMessage(userId, messageId, content);
        if (typeof ack === 'function') {
          ack({ success: true, data: { message } });
        }
      } catch (err) {
        handleSocketError(socket, err, ack);
      }
    });

    // Event: message:delete
    socket.on('message:delete', async (payload: unknown, ack?: (res: Record<string, unknown>) => void) => {
      try {
        const { messageId, mode } = socketDeleteMessageSchema.parse(payload);
        const res = await deleteMessage(userId, messageId, mode);
        if (typeof ack === 'function') {
          ack({ success: true, data: res });
        }
      } catch (err) {
        handleSocketError(socket, err, ack);
      }
    });

    // Event: reaction:add
    socket.on('reaction:add', async (payload: unknown, ack?: (res: Record<string, unknown>) => void) => {
      try {
        const { messageId, emoji } = socketReactionSchema.parse(payload);
        const res = await toggleMessageReaction(userId, messageId, emoji, 'add');
        if (typeof ack === 'function') {
          ack({ success: true, data: res });
        }
      } catch (err) {
        handleSocketError(socket, err, ack);
      }
    });

    // Event: reaction:remove
    socket.on('reaction:remove', async (payload: unknown, ack?: (res: Record<string, unknown>) => void) => {
      try {
        const { messageId, emoji } = socketReactionSchema.parse(payload);
        const res = await toggleMessageReaction(userId, messageId, emoji, 'remove');
        if (typeof ack === 'function') {
          ack({ success: true, data: res });
        }
      } catch (err) {
        handleSocketError(socket, err, ack);
      }
    });

    // Event: typing:start
    socket.on('typing:start', async (payload: unknown) => {
      try {
        const { conversationId } = joinLeaveSchema.parse(payload);
        const isMember = await ConversationModel.exists({
          _id: conversationId,
          'participants.userId': new Types.ObjectId(userId),
        });
        if (!isMember) return;

        socketTypingConversations.get(socket.id)?.add(conversationId);

        const key = `${conversationId}:${userId}`;
        const existingTimer = typingTimers.get(key);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        socket.to(`conversation:${conversationId}`).emit('typing:updated', {
          conversationId,
          userId,
          displayName,
          isTyping: true,
        });

        // Auto-expire typing state after 5 seconds if no refresh or stop received
        const timer = setTimeout(() => {
          typingTimers.delete(key);
          io.to(`conversation:${conversationId}`).emit('typing:updated', {
            conversationId,
            userId,
            displayName,
            isTyping: false,
          });
        }, 5000);

        typingTimers.set(key, timer);
      } catch {
        // Ignore invalid typing payload
      }
    });

    // Event: typing:stop
    socket.on('typing:stop', (payload: unknown) => {
      try {
        const { conversationId } = joinLeaveSchema.parse(payload);
        socketTypingConversations.get(socket.id)?.delete(conversationId);
        clearUserTyping(userId, displayName, conversationId, io);
      } catch {
        // Ignore invalid typing payload
      }
    });

    // Disconnection
    socket.on('disconnect', async () => {
      const activeConvs = socketTypingConversations.get(socket.id);
      if (activeConvs) {
        for (const cid of activeConvs) {
          clearUserTyping(userId, displayName, cid, io);
        }
        socketTypingConversations.delete(socket.id);
      }

      const isNowCompletelyOffline = socketManager.unregisterConnection(userId, socket.id);
      if (isNowCompletelyOffline) {
        try {
          const now = new Date();
          const updatedUser = await UserModel.findByIdAndUpdate(
            userId,
            { $set: { isOnline: false, lastSeenAt: now } },
            { new: true },
          ).lean();

          if (updatedUser) {
            const showLastSeen = updatedUser.privacySettings?.lastSeenVisibility !== 'nobody';
            io.emit('presence:updated', {
              userId,
              isOnline: false,
              availability: 'offline',
              lastSeenAt: showLastSeen ? now.toISOString() : null,
            });
          }
        } catch (err) {
          logger.error('Failed to update offline presence on disconnect', {
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
  });

  return io;
}
