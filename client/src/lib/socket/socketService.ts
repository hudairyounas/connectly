import { io, Socket } from 'socket.io-client';
import { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { User, Conversation, Message, AppNotification } from '../../types';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

class SocketClientService {
  private socket: Socket | null = null;
  private queryClient: QueryClient | null = null;
  private currentToken: string | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  setQueryClient(qc: QueryClient) {
    this.queryClient = qc;
  }

  connect(token: string) {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    if (this.socket && this.currentToken === token && (this.socket.connected || this.socket.active)) {
      return;
    }

    this.disconnectImmediate();
    this.currentToken = token;

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket = socket;

    socket.on('connect', () => {
      useUIStore.getState().setSocketConnected(true);
      const activeConvId = useUIStore.getState().selectedConversationId;
      if (activeConvId) {
        socket.emit('conversation:join', { conversationId: activeConvId });
      }
      // Resynchronize state upon connection/reconnection
      if (this.queryClient) {
        this.queryClient.invalidateQueries({ queryKey: ['conversations'] });
        if (activeConvId) {
          this.queryClient.invalidateQueries({ queryKey: ['messages', activeConvId] });
        }
      }
    });

    socket.on('disconnect', () => {
      useUIStore.getState().setSocketConnected(false);
    });

    socket.on('connect_error', () => {
      useUIStore.getState().setSocketConnected(false);
    });

    socket.on(
      'message:new',
      (payload: { message: Message; conversation: Conversation }) => {
        const myId = useAuthStore.getState().user?._id;
        const activeConvId = useUIStore.getState().selectedConversationId;

        // 1. Update messages cache for this conversation (reconciling optimistic message if present)
        if (this.queryClient) {
          this.queryClient.setQueryData<{
            messages: Message[];
            nextCursor: string | null;
            hasMore: boolean;
          }>(['messages', payload.message.conversationId], (old) => {
            if (!old) {
              return {
                messages: [payload.message],
                nextCursor: null,
                hasMore: false,
              };
            }
            const existsIndex = old.messages.findIndex(
              (m) =>
                m._id === payload.message._id ||
                (payload.message.clientMessageId &&
                  m.clientMessageId === payload.message.clientMessageId),
            );
            if (existsIndex >= 0) {
              const updated = [...old.messages];
              updated[existsIndex] = payload.message;
              return { ...old, messages: updated };
            }
            return {
              ...old,
              messages: [...old.messages, payload.message],
            };
          });

          // 2. Update conversations list cache
          this.upsertConversationInCache(payload.conversation);
        }

        // 3. If I am a recipient (not sender), emit explicit delivery acknowledgement
        if (myId && payload.message.senderId !== myId) {
          socket.emit('message:delivered', {
            conversationId: payload.message.conversationId,
            messageId: payload.message._id,
          });

          // If this conversation is actively open and visible, also emit read receipt
          if (
            activeConvId === payload.message.conversationId &&
            typeof document !== 'undefined' &&
            document.visibilityState === 'visible'
          ) {
            socket.emit('message:read', {
              conversationId: payload.message.conversationId,
              messageId: payload.message._id,
            });
          }
        }
      },
    );

    socket.on('message:updated', (payload: { message: Message }) => {
      if (!this.queryClient) return;
      this.queryClient.setQueryData<{
        messages: Message[];
        nextCursor: string | null;
        hasMore: boolean;
      }>(['messages', payload.message.conversationId], (old) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.map((m) =>
            m._id === payload.message._id ? payload.message : m,
          ),
        };
      });
      this.queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });

    socket.on(
      'message:deleted',
      (payload: {
        messageId: string;
        conversationId: string;
        mode: 'self' | 'everyone';
        isDeletedForEveryone: boolean;
        deletedAt?: string;
      }) => {
        if (!this.queryClient) return;
        this.queryClient.setQueryData<{
          messages: Message[];
          nextCursor: string | null;
          hasMore: boolean;
        }>(['messages', payload.conversationId], (old) => {
          if (!old) return old;
          if (payload.mode === 'self') {
            return {
              ...old,
              messages: old.messages.filter((m) => m._id !== payload.messageId),
            };
          }
          return {
            ...old,
            messages: old.messages.map((m) =>
              m._id === payload.messageId
                ? {
                    ...m,
                    isDeletedForEveryone: true,
                    content: 'This message was deleted',
                    attachments: [],
                    reactions: [],
                    deletedAt: payload.deletedAt || new Date().toISOString(),
                  }
                : m,
            ),
          };
        });
        this.queryClient.invalidateQueries({ queryKey: ['conversations'] });
      },
    );

    socket.on(
      'message:delivered',
      (payload: { messageId: string; conversationId: string; userId: string }) => {
        if (!this.queryClient) return;
        this.queryClient.setQueryData<{
          messages: Message[];
          nextCursor: string | null;
          hasMore: boolean;
        }>(['messages', payload.conversationId], (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) => {
              if (m._id !== payload.messageId) return m;
              const deliveredTo = Array.from(new Set([...m.deliveredTo, payload.userId]));
              const status = m.status === 'read' ? 'read' : 'delivered';
              return { ...m, deliveredTo, status };
            }),
          };
        });
      },
    );

    socket.on(
      'message:read',
      (payload: {
        conversationId: string;
        userId: string;
        lastReadMessageId: string | null;
        readAt: string;
      }) => {
        if (!this.queryClient) return;
        const myId = useAuthStore.getState().user?._id;

        this.queryClient.setQueryData<{
          messages: Message[];
          nextCursor: string | null;
          hasMore: boolean;
        }>(['messages', payload.conversationId], (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) => {
              if (m.senderId === payload.userId) return m;
              const readBy = Array.from(new Set([...m.readBy, payload.userId]));
              const deliveredTo = Array.from(new Set([...m.deliveredTo, payload.userId]));
              return {
                ...m,
                readBy,
                deliveredTo,
                status: 'read',
              };
            }),
          };
        });

        // If I read the conversation from another tab, clear unread badge
        if (myId && payload.userId === myId) {
          this.queryClient.setQueryData<{ conversations: Conversation[] }>(
            ['conversations'],
            (old) => {
              if (!old) return old;
              return {
                conversations: old.conversations.map((c) =>
                  c._id === payload.conversationId
                    ? {
                        ...c,
                        mySettings: { ...c.mySettings, unreadCount: 0 },
                      }
                    : c,
                ),
              };
            },
          );
        }
      },
    );

    socket.on(
      'reaction:updated',
      (payload: {
        messageId: string;
        conversationId: string;
        reactions: Message['reactions'];
      }) => {
        if (!this.queryClient) return;
        this.queryClient.setQueryData<{
          messages: Message[];
          nextCursor: string | null;
          hasMore: boolean;
        }>(['messages', payload.conversationId], (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((m) =>
              m._id === payload.messageId ? { ...m, reactions: payload.reactions } : m,
            ),
          };
        });
      },
    );

    socket.on(
      'typing:updated',
      (payload: {
        conversationId: string;
        userId: string;
        displayName: string;
        isTyping: boolean;
      }) => {
        const myId = useAuthStore.getState().user?._id;
        if (payload.userId === myId) return;
        useUIStore
          .getState()
          .setTypingState(
            payload.conversationId,
            payload.userId,
            payload.displayName,
            payload.isTyping,
          );
      },
    );

    socket.on(
      'presence:updated',
      (payload: {
        userId: string;
        isOnline: boolean;
        availability: User['availability'];
        lastSeenAt: string | null;
      }) => {
        if (!this.queryClient) return;
        this.queryClient.setQueryData<{ conversations: Conversation[] }>(
          ['conversations'],
          (old) => {
            if (!old) return old;
            return {
              conversations: old.conversations.map((c) => {
                const updatedPeer =
                  c.peer && c.peer._id === payload.userId
                    ? {
                        ...c.peer,
                        isOnline: payload.isOnline,
                        availability: payload.availability,
                        lastSeenAt: payload.lastSeenAt,
                      }
                    : c.peer;

                const updatedParticipants = c.participants.map((p) =>
                  p.user._id === payload.userId
                    ? {
                        ...p,
                        user: {
                          ...p.user,
                          isOnline: payload.isOnline,
                          availability: payload.availability,
                          lastSeenAt: payload.lastSeenAt,
                        },
                      }
                    : p,
                );

                return {
                  ...c,
                  peer: updatedPeer,
                  participants: updatedParticipants,
                };
              }),
            };
          },
        );
      },
    );

    socket.on('conversation:updated', (payload: { conversation: Conversation }) => {
      this.upsertConversationInCache(payload.conversation);
    });

    socket.on('conversation:removed', (payload: { conversationId: string }) => {
      if (!this.queryClient) return;
      this.queryClient.setQueryData<{ conversations: Conversation[] }>(
        ['conversations'],
        (old) => {
          if (!old) return old;
          return {
            conversations: old.conversations.filter((c) => c._id !== payload.conversationId),
          };
        },
      );
      if (useUIStore.getState().selectedConversationId === payload.conversationId) {
        useUIStore.getState().setSelectedConversationId(null);
      }
    });

    socket.on('notification:new', (payload: { notification: AppNotification }) => {
      if (this.queryClient) {
        this.queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
      useUIStore.getState().addToast({
        title: payload.notification.title,
        description: payload.notification.body,
        variant: 'info',
      });
    });
  }

  private upsertConversationInCache(conversation: Conversation) {
    if (!this.queryClient) return;
    this.queryClient.setQueryData<{ conversations: Conversation[] }>(
      ['conversations'],
      (old) => {
        if (!old) return { conversations: [conversation] };
        const filtered = old.conversations.filter((c) => c._id !== conversation._id);
        const next = [conversation, ...filtered];
        next.sort((a, b) => {
          if (a.mySettings.isPinned !== b.mySettings.isPinned) {
            return a.mySettings.isPinned ? -1 : 1;
          }
          return (
            new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
          );
        });
        return { conversations: next };
      },
    );
  }

  joinConversation(conversationId: string) {
    this.socket?.emit('conversation:join', { conversationId });
  }

  leaveConversation(conversationId: string) {
    this.socket?.emit('conversation:leave', { conversationId });
  }

  emitTypingStart(conversationId: string) {
    this.socket?.emit('typing:start', { conversationId });
  }

  emitTypingStop(conversationId: string) {
    this.socket?.emit('typing:stop', { conversationId });
  }

  emitMarkRead(conversationId: string, messageId?: string) {
    this.socket?.emit('message:read', { conversationId, messageId });
  }

  scheduleDisconnect() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
    }
    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = null;
      this.disconnectImmediate();
    }, 150);
  }

  disconnectImmediate() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.currentToken = null;
      useUIStore.getState().setSocketConnected(false);
    }
  }

  disconnect() {
    this.disconnectImmediate();
  }
}

export const socketService = new SocketClientService();
