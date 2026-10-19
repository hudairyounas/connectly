import React, { useState } from 'react';
import { X, Search, MessageSquarePlus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useUIStore } from '../../stores/uiStore';
import { Avatar } from '../ui/Avatar';

export const NewChatModal: React.FC = () => {
  const activeModal = useUIStore((s) => s.activeModal);
  const setActiveModal = useUIStore((s) => s.setActiveModal);
  const setSelectedConversationId = useUIStore((s) => s.setSelectedConversationId);
  const setActiveNav = useUIStore((s) => s.setActiveNav);
  const addToast = useUIStore((s) => s.addToast);

  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();

  const isOpen = activeModal?.type === 'new-chat';

  const { data, isLoading } = useQuery({
    queryKey: ['users-search-modal', query],
    queryFn: () => api.users.search(query),
    enabled: isOpen,
  });

  const createDirectMutation = useMutation({
    mutationFn: (userId: string) => api.conversations.createDirect(userId),
    onSuccess: ({ conversation }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setActiveNav('chats');
      setSelectedConversationId(conversation._id);
      setActiveModal(null);
    },
    onError: (err: Error) => {
      addToast({
        title: 'Unable to start conversation',
        description: err.message,
        variant: 'error',
      });
    },
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-chat-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-md rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel overflow-hidden flex flex-col max-h-[82vh]">
        <div className="px-5 py-4 border-b border-app-border dark:border-app-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-app-accent" />
            <h2 id="new-chat-modal-title" className="text-base font-bold">
              New Direct Message
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-app-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-app-border dark:border-app-dark-border">
          <div className="relative">
            <Search className="w-4 h-4 text-app-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people by name or @username..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-app-border/60 dark:divide-app-dark-border/60">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-app-muted">Loading directory...</div>
          ) : !data?.users.length ? (
            <div className="p-8 text-center text-xs text-app-muted">
              No users found matching your search.
            </div>
          ) : (
            data.users.map((u) => (
              <div
                key={u._id}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-app-incoming/60 dark:hover:bg-app-dark-elevated/60"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    name={u.displayName}
                    src={u.avatar}
                    size="md"
                    isOnline={u.isOnline}
                    availability={u.availability}
                    showPresence={true}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{u.displayName}</p>
                    <p className="text-xs text-app-muted truncate">@{u.username}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={createDirectMutation.isPending || u.isBlockedByMe}
                  onClick={() => createDirectMutation.mutate(u._id)}
                  className="px-3.5 py-1.5 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  {u.isBlockedByMe ? 'Blocked' : 'Chat'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
