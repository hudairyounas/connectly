import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  Info,
  Pin,
  VolumeX,
  Archive,
  MessageSquareText,
  Plus,
  UsersRound,
  X,
  Download,
  ChevronUp,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Conversation, Message, Attachment } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { api } from '../../lib/api/client';
import { socketService } from '../../lib/socket/socketService';
import { Avatar } from '../ui/Avatar';
import { MessageSkeletonList } from '../ui/SkeletonLoader';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import {
  formatDateSeparator,
  shouldShowDateSeparator,
  formatLastSeen,
  formatMessageTimestamp,
} from '../../lib/utils/format';

interface ChatPanelProps {
  conversation: Conversation | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ conversation }) => {
  const currentUser = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSelectedConversationId = useUIStore((s) => s.setSelectedConversationId);
  const setActiveModal = useUIStore((s) => s.setActiveModal);
  const typingByConversation = useUIStore((s) => s.typingByConversation);
  const addToast = useUIStore((s) => s.addToast);

  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const conversationId = conversation?._id || '';

  // Join/leave socket room & mark read when opening conversation
  useEffect(() => {
    if (!conversationId) return;
    setReplyingTo(null);
    setEditingMessage(null);
    setShowSearch(false);
    setSearchTerm('');

    socketService.joinConversation(conversationId);
    socketService.emitMarkRead(conversationId);
    void api.conversations.markRead(conversationId).catch(() => {});

    return () => {
      socketService.leaveConversation(conversationId);
    };
  }, [conversationId]);

  const {
    data: msgData,
    isLoading: isLoadingMessages,
    isError: isMessagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.conversations.getMessages(conversationId),
    enabled: Boolean(conversationId),
  });

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['conversation-search', conversationId, searchTerm],
    queryFn: () => api.conversations.searchMessages(conversationId, searchTerm),
    enabled: Boolean(conversationId) && showSearch && searchTerm.trim().length > 0,
  });

  // Scroll to bottom when conversation changes or new message arrives
  useEffect(() => {
    if (!msgData?.messages.length || isLoadingOlder) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationId, msgData?.messages.length, isLoadingOlder]);

  const updateConvMutation = useMutation({
    mutationFn: (settings: { isPinned?: boolean; isMuted?: boolean; isArchived?: boolean }) =>
      api.conversations.updateSettings(conversationId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Welcome State when no conversation is selected
  if (!conversation) {
    return (
      <main className="hidden md:flex flex-1 flex-col items-center justify-center p-8 bg-app-bg dark:bg-app-dark-bg text-center select-none">
        <div className="max-w-md space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-app-accent/10 text-app-accent flex items-center justify-center mx-auto shadow-soft">
            <MessageSquareText className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight">Select a conversation</h2>
            <p className="text-sm text-app-muted dark:text-app-dark-muted leading-relaxed">
              Choose an existing thread from the sidebar, start a private conversation with a
              contact, or create a group workspace.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setActiveModal({ type: 'new-chat' })}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white text-xs font-semibold shadow-soft transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Direct Message</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal({ type: 'create-group' })}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-app-border dark:border-app-dark-border bg-app-surface dark:bg-app-dark-surface hover:bg-app-incoming dark:hover:bg-app-dark-elevated text-xs font-semibold transition-colors"
            >
              <UsersRound className="w-4 h-4" />
              <span>Create Group</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  const isGroup = conversation.type === 'group';
  const title = isGroup
    ? conversation.groupName || 'Group'
    : conversation.peer?.displayName || 'Unknown User';
  const avatarSrc = isGroup ? conversation.groupAvatar : conversation.peer?.avatar;
  const typingUsers = typingByConversation[conversationId] || [];

  const subtitle =
    typingUsers.length > 0
      ? isGroup
        ? `${typingUsers.map((t) => t.displayName).join(', ')} typing...`
        : 'Typing...'
      : isGroup
        ? `${conversation.participants.length} members`
        : conversation.peer?.isDeleted
          ? 'Deleted Account'
          : conversation.peer?.isOnline
            ? `Online · ${conversation.peer.statusText || 'Available'}`
            : formatLastSeen(conversation.peer?.lastSeenAt);

  // Optimistic Send + Recovery
  const executeSend = async (params: {
    content: string;
    replyTo: Message | null;
    attachments: Attachment[];
    existingClientMessageId?: string;
  }) => {
    if (!currentUser) return;
    const clientMessageId =
      params.existingClientMessageId ||
      `cmsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const optimisticMsg: Message = {
      _id: clientMessageId,
      conversationId,
      senderId: currentUser._id,
      sender: currentUser,
      clientMessageId,
      type: params.attachments.length > 0 && !params.content ? 'attachment' : 'text',
      content: params.content,
      attachments: params.attachments,
      replyTo: params.replyTo
        ? {
            _id: params.replyTo._id,
            content: params.replyTo.content || 'Attachment',
            type: params.replyTo.type,
            isDeletedForEveryone: params.replyTo.isDeletedForEveryone,
            sender: {
              _id: params.replyTo.sender._id,
              displayName: params.replyTo.sender.displayName,
            },
          }
        : null,
      reactions: [],
      deliveredTo: [currentUser._id],
      readBy: [currentUser._id],
      status: 'sending',
      isDeletedForEveryone: false,
      deletedAt: null,
      editedAt: null,
      createdAt: new Date().toISOString(),
    };

    queryClient.setQueryData<{
      messages: Message[];
      nextCursor: string | null;
      hasMore: boolean;
    }>(['messages', conversationId], (old) => {
      if (!old) {
        return { messages: [optimisticMsg], nextCursor: null, hasMore: false };
      }
      const existingIdx = old.messages.findIndex(
        (m) => m.clientMessageId === clientMessageId || m._id === clientMessageId,
      );
      if (existingIdx >= 0) {
        const copy = [...old.messages];
        copy[existingIdx] = optimisticMsg;
        return { ...old, messages: copy };
      }
      return { ...old, messages: [...old.messages, optimisticMsg] };
    });

    try {
      const res = await api.conversations.sendMessage(conversationId, {
        content: params.content,
        clientMessageId,
        replyTo: params.replyTo?._id || null,
        attachmentIds: params.attachments.map((a) => a._id),
      });

      queryClient.setQueryData<{
        messages: Message[];
        nextCursor: string | null;
        hasMore: boolean;
      }>(['messages', conversationId], (old) => {
        if (!old) return { messages: [res.message], nextCursor: null, hasMore: false };
        // Replace optimistic message or deduplicate if socket already inserted it
        const filtered = old.messages.filter(
          (m) =>
            m._id !== clientMessageId &&
            m._id !== res.message._id &&
            m.clientMessageId !== clientMessageId,
        );
        return { ...old, messages: [...filtered, res.message] };
      });
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Failed to send';
      queryClient.setQueryData<{
        messages: Message[];
        nextCursor: string | null;
        hasMore: boolean;
      }>(['messages', conversationId], (old) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.map((m) =>
            m.clientMessageId === clientMessageId
              ? { ...m, status: 'failed', errorMessage: errMessage }
              : m,
          ),
        };
      });
    }
  };

  const handleLoadOlder = async () => {
    if (!msgData?.nextCursor || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const older = await api.conversations.getMessages(conversationId, msgData.nextCursor);
      queryClient.setQueryData<{
        messages: Message[];
        nextCursor: string | null;
        hasMore: boolean;
      }>(['messages', conversationId], (old) => {
        if (!old) return older;
        const existingIds = new Set(old.messages.map((m) => m._id));
        const uniqueOlder = older.messages.filter((m) => !existingIds.has(m._id));
        return {
          messages: [...uniqueOlder, ...old.messages],
          nextCursor: older.nextCursor,
          hasMore: older.hasMore,
        };
      });
    } catch {
      addToast({ title: 'Could not load older messages', variant: 'error' });
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleEditSave = async (messageId: string, newContent: string) => {
    const res = await api.messages.edit(messageId, newContent);
    queryClient.setQueryData<{
      messages: Message[];
      nextCursor: string | null;
      hasMore: boolean;
    }>(['messages', conversationId], (old) => {
      if (!old) return old;
      return {
        ...old,
        messages: old.messages.map((m) => (m._id === messageId ? res.message : m)),
      };
    });
  };

  const handleDeleteMessage = async (msg: Message, mode: 'self' | 'everyone') => {
    try {
      await api.messages.delete(msg._id, mode);
    } catch (err) {
      addToast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unable to delete message',
        variant: 'error',
      });
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    try {
      await api.messages.toggleReaction(messageId, emoji);
    } catch (err) {
      addToast({
        title: 'Reaction failed',
        description: err instanceof Error ? err.message : 'Could not update reaction',
        variant: 'error',
      });
    }
  };

  const jumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(messageId);
      setTimeout(() => setHighlightedMsgId(null), 2200);
    }
  };

  const messages = msgData?.messages || [];

  return (
    <main className="flex-1 flex flex-col h-full bg-app-bg dark:bg-app-dark-bg overflow-hidden relative">
      {/* Chat Header */}
      <header className="h-16 px-3 sm:px-5 bg-app-surface dark:bg-app-dark-surface border-b border-app-border dark:border-app-dark-border flex items-center justify-between gap-3 shrink-0 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mobile Back Button */}
          <button
            type="button"
            onClick={() => setSelectedConversationId(null)}
            aria-label="Back to conversations"
            className="md:hidden p-2 -ml-1 rounded-xl text-app-muted hover:text-app-text hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isGroup) {
                setActiveModal({ type: 'group-info', conversationId });
              } else if (conversation.peer) {
                setActiveModal({ type: 'user-profile', userId: conversation.peer._id });
              }
            }}
            className="flex items-center gap-3 min-w-0 text-left hover:opacity-90 transition-opacity"
          >
            <Avatar
              name={title}
              src={avatarSrc}
              size="md"
              isGroup={isGroup}
              isOnline={!isGroup && Boolean(conversation.peer?.isOnline)}
              availability={conversation.peer?.availability}
              showPresence={!isGroup}
            />
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate">{title}</h2>
              <p
                className={`text-xs truncate ${
                  typingUsers.length > 0
                    ? 'text-app-accent font-semibold'
                    : 'text-app-muted dark:text-app-dark-muted'
                }`}
              >
                {subtitle}
              </p>
            </div>
          </button>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSearch((prev) => !prev)}
            title="Search in conversation"
            aria-label="Search in conversation"
            className={`p-2 rounded-xl transition-colors ${
              showSearch
                ? 'bg-app-accent/15 text-app-accent'
                : 'text-app-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() =>
              updateConvMutation.mutate({ isPinned: !conversation.mySettings.isPinned })
            }
            title={conversation.mySettings.isPinned ? 'Unpin chat' : 'Pin chat'}
            aria-label={conversation.mySettings.isPinned ? 'Unpin chat' : 'Pin chat'}
            className={`p-2 rounded-xl transition-colors ${
              conversation.mySettings.isPinned
                ? 'text-app-accent bg-app-accent/10'
                : 'text-app-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated'
            }`}
          >
            <Pin className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() =>
              updateConvMutation.mutate({ isMuted: !conversation.mySettings.isMuted })
            }
            title={conversation.mySettings.isMuted ? 'Unmute notifications' : 'Mute notifications'}
            aria-label={
              conversation.mySettings.isMuted ? 'Unmute notifications' : 'Mute notifications'
            }
            className={`p-2 rounded-xl transition-colors ${
              conversation.mySettings.isMuted
                ? 'text-amber-500 bg-amber-500/10'
                : 'text-app-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated'
            }`}
          >
            <VolumeX className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() =>
              updateConvMutation.mutate({ isArchived: !conversation.mySettings.isArchived })
            }
            title={conversation.mySettings.isArchived ? 'Unarchive chat' : 'Archive chat'}
            aria-label={conversation.mySettings.isArchived ? 'Unarchive chat' : 'Archive chat'}
            className="p-2 rounded-xl text-app-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated transition-colors"
          >
            <Archive className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isGroup) {
                setActiveModal({ type: 'group-info', conversationId });
              } else if (conversation.peer) {
                setActiveModal({ type: 'user-profile', userId: conversation.peer._id });
              }
            }}
            title={isGroup ? 'Group information' : 'Contact information'}
            aria-label={isGroup ? 'Group information' : 'Contact information'}
            className="p-2 rounded-xl text-app-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* In-Conversation Search Bar & Results Drawer */}
      {showSearch && (
        <div className="bg-app-surface dark:bg-app-dark-surface border-b border-app-border dark:border-app-dark-border px-4 py-2.5 z-10">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-app-muted shrink-0" />
            <input
              type="search"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search messages in this conversation..."
              aria-label="Search messages in this conversation"
              className="flex-1 text-xs py-1.5 px-2.5 rounded-lg bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent"
            />
            <button
              type="button"
              onClick={() => {
                setShowSearch(false);
                setSearchTerm('');
              }}
              aria-label="Close message search"
              className="p-1 rounded-lg text-app-muted hover:text-app-text"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {searchTerm.trim().length > 0 && (
            <div className="mt-2 max-h-44 overflow-y-auto divide-y divide-app-border/60 dark:divide-app-dark-border/60 rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/50">
              {isSearching ? (
                <div className="p-3 text-center text-xs text-app-muted">Searching...</div>
              ) : !searchResults?.messages.length ? (
                <div className="p-3 text-center text-xs text-app-muted">
                  No matching messages found.
                </div>
              ) : (
                searchResults.messages.map((m) => (
                  <button
                    key={m._id}
                    type="button"
                    onClick={() => jumpToMessage(m._id)}
                    className="w-full text-left px-3 py-2 hover:bg-app-incoming dark:hover:bg-app-dark-elevated text-xs flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-app-accent">
                        {m.sender.displayName}:{' '}
                      </span>
                      <span className="truncate">{m.content}</span>
                    </div>
                    <span className="text-[10px] text-app-muted shrink-0">
                      {formatMessageTimestamp(m.createdAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Message History Area */}
      {isLoadingMessages ? (
        <MessageSkeletonList />
      ) : isMessagesError ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">
            Failed to load message history
          </p>
          <button
            type="button"
            onClick={() => void refetchMessages()}
            className="px-4 py-2 rounded-xl bg-app-accent text-white text-xs font-semibold"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-1.5">
          {/* Load Older Messages Pagination Button */}
          {msgData?.hasMore && (
            <div className="flex justify-center py-2">
              <button
                type="button"
                disabled={isLoadingOlder}
                onClick={() => void handleLoadOlder()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border text-xs font-semibold text-app-accent shadow-soft hover:bg-app-incoming transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>{isLoadingOlder ? 'Loading older messages...' : 'Load older messages'}</span>
              </button>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-2">
              <p className="text-sm font-semibold">No messages in this conversation yet</p>
              <p className="text-xs text-app-muted">
                Send a message or share an attachment below to start the conversation.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const prevMsg = idx > 0 ? messages[idx - 1] : undefined;
              const showSeparator = shouldShowDateSeparator(msg.createdAt, prevMsg?.createdAt);
              const isOwn = Boolean(currentUser && msg.senderId === currentUser._id);
              const canDeleteForEveryone =
                isOwn || (isGroup && conversation.mySettings.role === 'admin');

              return (
                <React.Fragment key={msg._id}>
                  {showSeparator && (
                    <div className="flex items-center justify-center my-3 select-none">
                      <span className="px-3 py-1 rounded-full bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border text-[11px] font-semibold text-app-muted shadow-soft">
                        {formatDateSeparator(msg.createdAt)}
                      </span>
                    </div>
                  )}

                  <MessageBubble
                    message={msg}
                    isOwn={isOwn}
                    isGroup={isGroup}
                    canDeleteForEveryone={canDeleteForEveryone}
                    highlighted={highlightedMsgId === msg._id}
                    onReply={(m) => {
                      setEditingMessage(null);
                      setReplyingTo(m);
                    }}
                    onEdit={(m) => {
                      setReplyingTo(null);
                      setEditingMessage(m);
                    }}
                    onDelete={handleDeleteMessage}
                    onToggleReaction={handleToggleReaction}
                    onRetrySend={(failedMsg) =>
                      void executeSend({
                        content: failedMsg.content,
                        replyTo: null,
                        attachments: failedMsg.attachments,
                        existingClientMessageId: failedMsg.clientMessageId,
                      })
                    }
                    onJumpToMessage={jumpToMessage}
                    onPreviewImage={(att) => setLightboxAttachment(att)}
                  />
                </React.Fragment>
              );
            })
          )}

          {/* Animated Typing Indicator Bubble */}
          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-app-incoming dark:bg-app-dark-elevated text-xs text-app-muted">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-app-accent animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-app-accent animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-app-accent animate-bounce [animation-delay:300ms]" />
                </span>
                <span>
                  {typingUsers.map((t) => t.displayName).join(', ')}{' '}
                  {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Message Composer */}
      <MessageComposer
        conversationId={conversationId}
        replyingTo={replyingTo}
        editingMessage={editingMessage}
        disabled={!isGroup && Boolean(conversation.peer?.isDeleted)}
        disabledReason="This account is no longer active."
        onCancelReply={() => setReplyingTo(null)}
        onCancelEdit={() => setEditingMessage(null)}
        onSendMessage={executeSend}
        onSaveEdit={handleEditSave}
      />

      {/* Image Lightbox Modal */}
      {lightboxAttachment && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightboxAttachment(null)}
          className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4"
        >
          <div
            className="flex items-center justify-between w-full max-w-4xl mb-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-semibold truncate">
              {lightboxAttachment.originalName}
            </span>
            <div className="flex items-center gap-2">
              <a
                href={`${lightboxAttachment.url}?download=1${
                  accessToken ? `&token=${encodeURIComponent(accessToken)}` : ''
                }`}
                download={lightboxAttachment.originalName}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </a>
              <button
                type="button"
                onClick={() => setLightboxAttachment(null)}
                aria-label="Close image preview"
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <img
            src={`${lightboxAttachment.url}${
              accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''
            }`}
            alt={lightboxAttachment.originalName}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </main>
  );
};
