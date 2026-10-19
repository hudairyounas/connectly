import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  UsersRound,
  Pin,
  VolumeX,
  Archive,
  MessageSquarePlus,
  Sparkles,
  UserCheck,
  ShieldBan,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Conversation } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api/client';
import { Avatar } from '../ui/Avatar';
import { ConversationSkeletonList } from '../ui/SkeletonLoader';
import { formatConversationTime } from '../../lib/utils/format';

interface ConversationSidebarProps {
  conversations: Conversation[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  isLoading,
  isError,
  onRetry,
}) => {
  const currentUser = useAuthStore((s) => s.user);
  const activeNav = useUIStore((s) => s.activeNav);
  const setActiveNav = useUIStore((s) => s.setActiveNav);
  const selectedConversationId = useUIStore((s) => s.selectedConversationId);
  const setSelectedConversationId = useUIStore((s) => s.setSelectedConversationId);
  const typingByConversation = useUIStore((s) => s.typingByConversation);
  const setActiveModal = useUIStore((s) => s.setActiveModal);
  const addToast = useUIStore((s) => s.addToast);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchTerm.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: userSearchData, isLoading: isSearchingUsers } = useQuery({
    queryKey: ['users-search', debouncedQuery, activeNav],
    queryFn: () => api.users.search(debouncedQuery),
    enabled: activeNav === 'contacts' || debouncedQuery.length >= 1,
  });

  const startDirectMutation = useMutation({
    mutationFn: (participantId: string) => api.conversations.createDirect(participantId),
    onSuccess: ({ conversation }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setActiveNav('chats');
      setSelectedConversationId(conversation._id);
      setSearchTerm('');
    },
    onError: (err: Error) => {
      addToast({
        title: 'Could not start conversation',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const updateConvMutation = useMutation({
    mutationFn: (params: {
      conversationId: string;
      settings: { isPinned?: boolean; isMuted?: boolean; isArchived?: boolean };
    }) => api.conversations.updateSettings(params.conversationId, params.settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Filter conversations based on active navigation section & search query
  const filteredConversations = conversations.filter((conv) => {
    if (activeNav === 'archived') {
      if (!conv.mySettings.isArchived) return false;
    } else {
      if (conv.mySettings.isArchived) return false;
    }

    if (activeNav === 'groups' && conv.type !== 'group') {
      return false;
    }

    if (!debouncedQuery) return true;
    const q = debouncedQuery.toLowerCase();
    const title =
      conv.type === 'group'
        ? conv.groupName || 'Group'
        : conv.peer?.displayName || conv.peer?.username || '';
    const lastPreview = conv.lastMessage?.contentPreview || '';
    return title.toLowerCase().includes(q) || lastPreview.toLowerCase().includes(q);
  });

  const sectionTitle =
    activeNav === 'groups'
      ? 'Groups'
      : activeNav === 'archived'
        ? 'Archived Chats'
        : activeNav === 'contacts'
          ? 'People & Contacts'
          : 'Messages';

  return (
    <section
      aria-label="Conversation list"
      className="w-full md:w-80 lg:w-[340px] shrink-0 flex flex-col h-full bg-app-surface dark:bg-app-dark-surface border-r border-app-border dark:border-app-dark-border select-none"
    >
      {/* Top Header */}
      <div className="px-4 pt-4 pb-3 border-b border-app-border dark:border-app-dark-border space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">{sectionTitle}</h1>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveModal({ type: 'new-chat' })}
              title="Start new conversation"
              aria-label="Start new conversation"
              className="p-2 rounded-xl text-app-muted hover:text-app-text dark:hover:text-app-dark-text hover:bg-app-incoming dark:hover:bg-app-dark-elevated transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveModal({ type: 'create-group' })}
              title="Create new group"
              aria-label="Create new group"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white text-xs font-semibold shadow-soft transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Group</span>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-app-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeNav === 'contacts'
                ? 'Search by name or @username...'
                : 'Search chats or people...'
            }
            aria-label="Search conversations or users"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {activeNav === 'contacts' ? (
          /* Contacts & User Discovery View */
          <div className="divide-y divide-app-border/60 dark:divide-app-dark-border/60">
            {isSearchingUsers ? (
              <ConversationSkeletonList count={5} />
            ) : !userSearchData?.users.length ? (
              <div className="p-8 text-center space-y-2">
                <UserCheck className="w-8 h-8 text-app-muted mx-auto opacity-60" />
                <p className="text-sm font-semibold">No matching users found</p>
                <p className="text-xs text-app-muted">
                  Try searching for a different username or display name.
                </p>
              </div>
            ) : (
              userSearchData.users.map((u) => (
                <div
                  key={u._id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-app-incoming/60 dark:hover:bg-app-dark-elevated/60 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setActiveModal({ type: 'user-profile', userId: u._id })}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    <Avatar
                      name={u.displayName}
                      src={u.avatar}
                      size="md"
                      isOnline={u.isOnline}
                      availability={u.availability}
                      showPresence={true}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold truncate">{u.displayName}</p>
                        {u.isBlockedByMe && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                            <ShieldBan className="w-2.5 h-2.5" />
                            Blocked
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-app-muted dark:text-app-dark-muted truncate">
                        @{u.username} {u.statusText ? `· ${u.statusText}` : ''}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={startDirectMutation.isPending || u.isBlockedByMe}
                    onClick={() => startDirectMutation.mutate(u._id)}
                    className="px-3 py-1.5 rounded-xl bg-app-accent/10 hover:bg-app-accent hover:text-white text-app-accent text-xs font-semibold transition-colors disabled:opacity-40"
                  >
                    Message
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Conversations List */
          <>
            {isLoading ? (
              <ConversationSkeletonList count={6} />
            ) : isError ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                  Could not load conversations
                </p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-3.5 py-1.5 rounded-xl bg-app-accent text-white text-xs font-semibold"
                >
                  Retry
                </button>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-app-accent/10 text-app-accent flex items-center justify-center mx-auto">
                  {activeNav === 'groups' ? (
                    <UsersRound className="w-5 h-5" />
                  ) : activeNav === 'archived' ? (
                    <Archive className="w-5 h-5" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {debouncedQuery
                      ? 'No matching conversations'
                      : activeNav === 'archived'
                        ? 'No archived conversations'
                        : activeNav === 'groups'
                          ? 'No group chats yet'
                          : 'No conversations yet'}
                  </p>
                  <p className="text-xs text-app-muted dark:text-app-dark-muted mt-1 leading-relaxed">
                    {activeNav === 'archived'
                      ? 'Archived chats will appear here when you archive them.'
                      : 'Start a private chat or create a group to begin messaging.'}
                  </p>
                </div>
                {activeNav !== 'archived' && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveModal({
                        type: activeNav === 'groups' ? 'create-group' : 'new-chat',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white text-xs font-semibold shadow-soft transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{activeNav === 'groups' ? 'Create Group' : 'Start New Chat'}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-app-border/50 dark:divide-app-dark-border/50">
                {filteredConversations.map((conv) => {
                  const isSelected = selectedConversationId === conv._id;
                  const isGroup = conv.type === 'group';
                  const title = isGroup
                    ? conv.groupName || 'Unnamed Group'
                    : conv.peer?.displayName || 'Unknown User';
                  const avatarSrc = isGroup ? conv.groupAvatar : conv.peer?.avatar;
                  const typingUsers = typingByConversation[conv._id] || [];
                  const unread = conv.mySettings.unreadCount || 0;

                  const lastSenderPrefix =
                    conv.lastMessage &&
                    currentUser &&
                    conv.lastMessage.senderId === currentUser._id &&
                    conv.lastMessage.type !== 'system'
                      ? 'You: '
                      : '';

                  return (
                    <div
                      key={conv._id}
                      className={`group relative flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-app-accent/10 dark:bg-app-accent/20'
                          : 'hover:bg-app-incoming/70 dark:hover:bg-app-dark-elevated/60'
                      }`}
                      onClick={() => setSelectedConversationId(conv._id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedConversationId(conv._id);
                        }
                      }}
                    >
                      <Avatar
                        name={title}
                        src={avatarSrc}
                        size="md"
                        isGroup={isGroup}
                        isOnline={!isGroup && Boolean(conv.peer?.isOnline)}
                        availability={conv.peer?.availability}
                        showPresence={!isGroup}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`text-sm truncate ${
                                unread > 0 ? 'font-bold' : 'font-semibold'
                              }`}
                            >
                              {title}
                            </span>
                            {conv.mySettings.isPinned && (
                              <Pin
                                className="w-3 h-3 text-app-accent shrink-0"
                                aria-label="Pinned conversation"
                              />
                            )}
                            {conv.mySettings.isMuted && (
                              <VolumeX
                                className="w-3 h-3 text-app-muted shrink-0"
                                aria-label="Muted conversation"
                              />
                            )}
                          </div>

                          <span className="text-[11px] text-app-muted dark:text-app-dark-muted shrink-0">
                            {formatConversationTime(
                              conv.lastMessage?.createdAt || conv.lastActivityAt,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          {typingUsers.length > 0 ? (
                            <p className="text-xs font-medium text-app-accent truncate">
                              {isGroup
                                ? `${typingUsers[0].displayName} is typing...`
                                : 'Typing...'}
                            </p>
                          ) : (
                            <p
                              className={`text-xs truncate ${
                                unread > 0
                                  ? 'text-app-text dark:text-app-dark-text font-medium'
                                  : 'text-app-muted dark:text-app-dark-muted'
                              }`}
                            >
                              {conv.lastMessage
                                ? `${lastSenderPrefix}${conv.lastMessage.contentPreview}`
                                : 'No messages yet — say hello!'}
                            </p>
                          )}

                          <div className="flex items-center gap-1 shrink-0">
                            {unread > 0 && (
                              <span
                                aria-label={`${unread} unread messages`}
                                className="min-w-[20px] h-5 px-1.5 rounded-full bg-app-accent text-white text-[11px] font-bold flex items-center justify-center"
                              >
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}

                            {/* Quick Hover Actions */}
                            <div
                              className="hidden group-hover:flex items-center gap-0.5 bg-app-surface dark:bg-app-dark-surface rounded-lg px-1 py-0.5 shadow-soft border border-app-border dark:border-app-dark-border"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                title={conv.mySettings.isPinned ? 'Unpin' : 'Pin'}
                                aria-label={conv.mySettings.isPinned ? 'Unpin' : 'Pin'}
                                onClick={() =>
                                  updateConvMutation.mutate({
                                    conversationId: conv._id,
                                    settings: { isPinned: !conv.mySettings.isPinned },
                                  })
                                }
                                className={`p-1 rounded hover:bg-app-incoming dark:hover:bg-app-dark-elevated ${
                                  conv.mySettings.isPinned ? 'text-app-accent' : 'text-app-muted'
                                }`}
                              >
                                <Pin className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                title={conv.mySettings.isMuted ? 'Unmute' : 'Mute'}
                                aria-label={conv.mySettings.isMuted ? 'Unmute' : 'Mute'}
                                onClick={() =>
                                  updateConvMutation.mutate({
                                    conversationId: conv._id,
                                    settings: { isMuted: !conv.mySettings.isMuted },
                                  })
                                }
                                className={`p-1 rounded hover:bg-app-incoming dark:hover:bg-app-dark-elevated ${
                                  conv.mySettings.isMuted ? 'text-amber-500' : 'text-app-muted'
                                }`}
                              >
                                <VolumeX className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                title={conv.mySettings.isArchived ? 'Unarchive' : 'Archive'}
                                aria-label={conv.mySettings.isArchived ? 'Unarchive' : 'Archive'}
                                onClick={() =>
                                  updateConvMutation.mutate({
                                    conversationId: conv._id,
                                    settings: { isArchived: !conv.mySettings.isArchived },
                                  })
                                }
                                className="p-1 rounded hover:bg-app-incoming dark:hover:bg-app-dark-elevated text-app-muted"
                              >
                                <Archive className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick People Discovery when searching in Chats tab */}
            {debouncedQuery && userSearchData?.users && userSearchData.users.length > 0 && (
              <div className="mt-2 border-t border-app-border dark:border-app-dark-border pt-2">
                <p className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-app-muted">
                  People Directory
                </p>
                {userSearchData.users.map((u) => (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => startDirectMutation.mutate(u._id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-app-incoming/60 dark:hover:bg-app-dark-elevated/60 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={u.displayName}
                        src={u.avatar}
                        size="sm"
                        isOnline={u.isOnline}
                        showPresence={true}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{u.displayName}</p>
                        <p className="text-[11px] text-app-muted truncate">@{u.username}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-app-accent">Chat &rarr;</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
