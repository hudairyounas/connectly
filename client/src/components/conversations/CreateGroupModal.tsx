import React, { useState } from 'react';
import { X, UsersRound, Search, Check, Upload } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useUIStore } from '../../stores/uiStore';
import { Avatar } from '../ui/Avatar';

export const CreateGroupModal: React.FC = () => {
  const activeModal = useUIStore((s) => s.activeModal);
  const setActiveModal = useUIStore((s) => s.setActiveModal);
  const setSelectedConversationId = useUIStore((s) => s.setSelectedConversationId);
  const setActiveNav = useUIStore((s) => s.setActiveNav);
  const addToast = useUIStore((s) => s.addToast);

  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const isOpen = activeModal?.type === 'create-group';

  const { data } = useQuery({
    queryKey: ['users-search-group', query],
    queryFn: () => api.users.search(query),
    enabled: isOpen,
  });

  const createGroupMutation = useMutation({
    mutationFn: () =>
      api.groups.create({
        groupName: groupName.trim(),
        groupDescription: groupDescription.trim(),
        groupAvatar,
        participantIds: selectedUserIds,
      }),
    onSuccess: ({ conversation }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      addToast({
        title: `Group "${conversation.groupName}" created!`,
        variant: 'success',
      });
      setActiveNav('chats');
      setSelectedConversationId(conversation._id);
      setGroupName('');
      setGroupDescription('');
      setGroupAvatar(null);
      setSelectedUserIds([]);
      setActiveModal(null);
    },
    onError: (err: Error) => {
      setErrorMsg(err.message);
    },
  });

  if (!isOpen) return null;

  const toggleParticipant = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await api.users.uploadAvatar(file);
      setGroupAvatar(res.avatarUrl);
    } catch (err) {
      addToast({
        title: 'Group avatar upload failed',
        description: err instanceof Error ? err.message : 'Invalid image file',
        variant: 'error',
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (groupName.trim().length < 2) {
      setErrorMsg('Group name must be at least 2 characters.');
      return;
    }
    if (selectedUserIds.length === 0) {
      setErrorMsg('Please select at least 1 participant to add to the group.');
      return;
    }
    createGroupMutation.mutate();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-group-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-lg rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-5 py-4 border-b border-app-border dark:border-app-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersRound className="w-5 h-5 text-app-accent" />
            <h2 id="create-group-modal-title" className="text-base font-bold">
              Create Group Conversation
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

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto">
            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium"
              >
                {errorMsg}
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar
                  name={groupName || 'Group'}
                  src={groupAvatar}
                  size="lg"
                  isGroup={true}
                />
                <label
                  title="Upload group avatar"
                  className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-app-accent text-white cursor-pointer shadow-soft hover:bg-app-accent-hover"
                >
                  <Upload className="w-3 h-3" />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleAvatarFile}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex-1 space-y-2">
                <div>
                  <label
                    htmlFor="group-name-input"
                    className="block text-xs font-semibold uppercase tracking-wider text-app-muted mb-1"
                  >
                    Group Name
                  </label>
                  <input
                    id="group-name-input"
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g., Product Engineering"
                    className="w-full px-3.5 py-2 text-sm rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent"
                  />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="group-desc-input"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted mb-1"
              >
                Description (Optional)
              </label>
              <input
                id="group-desc-input"
                type="text"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                placeholder="What is this group about?"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-app-muted">
                  Add Participants
                </label>
                <span className="text-xs font-semibold text-app-accent">
                  {selectedUserIds.length} selected
                </span>
              </div>

              <div className="relative mb-2">
                <Search className="w-4 h-4 text-app-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter users..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent"
                />
              </div>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-app-border dark:border-app-dark-border divide-y divide-app-border/60 dark:divide-app-dark-border/60">
                {!data?.users.length ? (
                  <div className="p-4 text-center text-xs text-app-muted">No users found</div>
                ) : (
                  data.users.map((u) => {
                    const isChecked = selectedUserIds.includes(u._id);
                    return (
                      <button
                        key={u._id}
                        type="button"
                        onClick={() => toggleParticipant(u._id)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors ${
                          isChecked
                            ? 'bg-app-accent/10 dark:bg-app-accent/20'
                            : 'hover:bg-app-incoming/60 dark:hover:bg-app-dark-elevated/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={u.displayName} src={u.avatar} size="sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">{u.displayName}</p>
                            <p className="text-[11px] text-app-muted truncate">@{u.username}</p>
                          </div>
                        </div>

                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                            isChecked
                              ? 'bg-app-accent border-app-accent text-white'
                              : 'border-app-border dark:border-app-dark-border'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-app-border dark:border-app-dark-border flex items-center justify-end gap-2.5 bg-app-bg/40 dark:bg-app-dark-bg/40">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-app-border dark:border-app-dark-border hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createGroupMutation.isPending}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-app-accent hover:bg-app-accent-hover text-white shadow-soft disabled:opacity-50"
            >
              {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
