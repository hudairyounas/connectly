import React from 'react';
import { X, MessageSquare, ShieldBan, ShieldCheck } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useUIStore } from '../../stores/uiStore';
import { Avatar } from '../ui/Avatar';
import { formatLastSeen } from '../../lib/utils/format';

export const UserProfileModal: React.FC = () => {
  const activeModal = useUIStore((s) => s.activeModal);
  const setActiveModal = useUIStore((s) => s.setActiveModal);
  const setSelectedConversationId = useUIStore((s) => s.setSelectedConversationId);
  const setActiveNav = useUIStore((s) => s.setActiveNav);
  const addToast = useUIStore((s) => s.addToast);

  const queryClient = useQueryClient();
  const isOpen = activeModal?.type === 'user-profile';
  const targetUserId = isOpen ? activeModal.userId : '';

  const { data, isLoading } = useQuery({
    queryKey: ['user-profile', targetUserId],
    queryFn: () => api.users.getById(targetUserId),
    enabled: isOpen && Boolean(targetUserId),
  });

  const startDirectMutation = useMutation({
    mutationFn: () => api.conversations.createDirect(targetUserId),
    onSuccess: ({ conversation }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setActiveNav('chats');
      setSelectedConversationId(conversation._id);
      setActiveModal(null);
    },
    onError: (err: Error) => {
      addToast({
        title: 'Cannot start conversation',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const blockMutation = useMutation({
    mutationFn: (block: boolean) =>
      block ? api.users.block(targetUserId) : api.users.unblock(targetUserId),
    onSuccess: (_res, block) => {
      queryClient.invalidateQueries({ queryKey: ['user-profile', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['users-search'] });
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      addToast({
        title: block ? 'User blocked' : 'User unblocked',
        variant: 'info',
      });
    },
  });

  if (!isOpen) return null;

  const profile = data?.user;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-md rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel overflow-hidden">
        <div className="px-5 py-4 border-b border-app-border dark:border-app-dark-border flex items-center justify-between">
          <h2 id="user-profile-modal-title" className="text-base font-bold">
            Contact Profile
          </h2>
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            aria-label="Close profile dialog"
            className="p-1.5 rounded-lg text-app-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading || !profile ? (
          <div className="p-8 text-center text-xs text-app-muted">Loading profile...</div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center">
              <Avatar
                name={profile.displayName}
                src={profile.avatar}
                size="xl"
                isOnline={profile.isOnline}
                availability={profile.availability}
                showPresence={!profile.isDeleted}
              />
              <h3 className="text-lg font-bold mt-3">{profile.displayName}</h3>
              <p className="text-xs text-app-muted">@{profile.username}</p>
              <p className="text-xs font-medium mt-1 text-app-accent">
                {profile.isDeleted
                  ? 'Account unavailable'
                  : profile.isOnline
                    ? `Online (${profile.statusText || 'Available'})`
                    : formatLastSeen(profile.lastSeenAt)}
              </p>
            </div>

            {profile.bio && (
              <div className="p-3.5 rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border">
                <p className="text-[11px] font-bold uppercase tracking-wider text-app-muted mb-1">
                  About
                </p>
                <p className="text-xs leading-relaxed">{profile.bio}</p>
              </div>
            )}

            {!profile.isDeleted && (
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={startDirectMutation.isPending || profile.isBlockedByMe}
                  onClick={() => startDirectMutation.mutate()}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white text-xs font-semibold shadow-soft disabled:opacity-40 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Send Message</span>
                </button>

                <button
                  type="button"
                  disabled={blockMutation.isPending}
                  onClick={() => blockMutation.mutate(!profile.isBlockedByMe)}
                  className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border text-xs font-semibold transition-colors ${
                    profile.isBlockedByMe
                      ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                      : 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50'
                  }`}
                >
                  {profile.isBlockedByMe ? (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Unblock</span>
                    </>
                  ) : (
                    <>
                      <ShieldBan className="w-4 h-4" />
                      <span>Block</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
