import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  UserPlus,
  UserMinus,
  LogOut,
  Check,
  Upload,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../ui/Avatar';

export const GroupInfoModal: React.FC = () => {
  const currentUser = useAuthStore((s) => s.user);
  const activeModal = useUIStore((s) => s.activeModal);
  const setActiveModal = useUIStore((s) => s.setActiveModal);
  const setSelectedConversationId = useUIStore((s) => s.setSelectedConversationId);
  const addToast = useUIStore((s) => s.addToast);

  const queryClient = useQueryClient();
  const isOpen = activeModal?.type === 'group-info';
  const conversationId = isOpen ? activeModal.conversationId : '';

  const { data: convData } = useQuery({
    queryKey: ['conversation-detail', conversationId],
    queryFn: () => api.conversations.getById(conversationId),
    enabled: isOpen && Boolean(conversationId),
  });

  const conversation = convData?.conversation;
  const isAdmin = conversation?.mySettings.role === 'admin';

  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (conversation) {
      setGroupName(conversation.groupName || '');
      setGroupDescription(conversation.groupDescription || '');
    }
  }, [conversation]);

  const { data: searchData } = useQuery({
    queryKey: ['users-search-add-group', searchQuery],
    queryFn: () => api.users.search(searchQuery),
    enabled: isOpen && showAddMember,
  });

  const updateGroupMutation = useMutation({
    mutationFn: (body: {
      groupName?: string;
      groupDescription?: string;
      groupAvatar?: string | null;
    }) => api.groups.update(conversationId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-detail', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      addToast({ title: 'Group details updated', variant: 'success' });
    },
    onError: (err: Error) => {
      addToast({ title: 'Update failed', description: err.message, variant: 'error' });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => api.groups.addMembers(conversationId, [userId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-detail', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      addToast({ title: 'Member added to group', variant: 'success' });
    },
    onError: (err: Error) => {
      addToast({ title: 'Could not add member', description: err.message, variant: 'error' });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.groups.removeMember(conversationId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-detail', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      addToast({ title: 'Member removed from group', variant: 'info' });
    },
    onError: (err: Error) => {
      addToast({ title: 'Could not remove member', description: err.message, variant: 'error' });
    },
  });

  const roleMutation = useMutation({
    mutationFn: (params: { userId: string; role: 'admin' | 'member' }) =>
      api.groups.updateRole(conversationId, params.userId, params.role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-detail', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      addToast({ title: 'Member role updated', variant: 'success' });
    },
    onError: (err: Error) => {
      addToast({ title: 'Role change failed', description: err.message, variant: 'error' });
    },
  });

  const leaveGroupMutation = useMutation({
    mutationFn: () => api.groups.leave(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setSelectedConversationId(null);
      setActiveModal(null);
      addToast({ title: 'You left the group', variant: 'info' });
    },
    onError: (err: Error) => {
      addToast({ title: 'Could not leave group', description: err.message, variant: 'error' });
    },
  });

  if (!isOpen || !conversation) return null;

  const existingMemberIds = new Set(conversation.participants.map((p) => p.user._id));

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await api.users.uploadAvatar(file);
      updateGroupMutation.mutate({ groupAvatar: res.avatarUrl });
    } catch (err) {
      addToast({
        title: 'Group avatar upload failed',
        description: err instanceof Error ? err.message : 'Invalid image',
        variant: 'error',
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-info-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]"
    >
      <div className="w-full max-w-lg rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-5 py-4 border-b border-app-border dark:border-app-dark-border flex items-center justify-between">
          <h2 id="group-info-modal-title" className="text-base font-bold">
            Group Information
          </h2>
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            aria-label="Close group info"
            className="p-1.5 rounded-lg text-app-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Group Header & Admin Settings */}
          <div className="flex items-start gap-4">
            <div className="relative">
              <Avatar
                name={conversation.groupName || 'Group'}
                src={conversation.groupAvatar}
                size="lg"
                isGroup={true}
              />
              {isAdmin && (
                <label
                  title="Change group avatar"
                  className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-app-accent text-white cursor-pointer shadow-soft hover:bg-app-accent-hover"
                >
                  <Upload className="w-3 h-3" />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="flex-1 space-y-2">
              {isAdmin ? (
                <>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    aria-label="Group name"
                    className="w-full px-3 py-1.5 text-sm font-semibold rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border"
                  />
                  <input
                    type="text"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Add a group description..."
                    aria-label="Group description"
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border"
                  />
                  <button
                    type="button"
                    disabled={updateGroupMutation.isPending}
                    onClick={() =>
                      updateGroupMutation.mutate({
                        groupName: groupName.trim(),
                        groupDescription: groupDescription.trim(),
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-app-accent text-white text-xs font-semibold hover:bg-app-accent-hover"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Details</span>
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-base font-bold">{conversation.groupName}</h3>
                  <p className="text-xs text-app-muted">
                    {conversation.groupDescription || 'No group description set.'}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Add Member Drawer for Admins */}
          {isAdmin && (
            <div className="border-t border-app-border dark:border-app-dark-border pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-app-muted">
                  Add Participants
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddMember((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-app-accent hover:underline"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{showAddMember ? 'Hide Search' : 'Add Member'}</span>
                </button>
              </div>

              {showAddMember && (
                <div className="space-y-2 mt-2">
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search people to add..."
                    className="w-full px-3 py-2 text-xs rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border"
                  />
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-app-border dark:border-app-dark-border divide-y divide-app-border/60 dark:divide-app-dark-border/60">
                    {(searchData?.users || [])
                      .filter((u) => !existingMemberIds.has(u._id))
                      .map((u) => (
                        <div
                          key={u._id}
                          className="flex items-center justify-between px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar name={u.displayName} src={u.avatar} size="xs" />
                            <span className="font-semibold">{u.displayName}</span>
                            <span className="text-app-muted">@{u.username}</span>
                          </div>
                          <button
                            type="button"
                            disabled={addMemberMutation.isPending}
                            onClick={() => addMemberMutation.mutate(u._id)}
                            className="px-2.5 py-1 rounded-lg bg-app-accent text-white font-semibold"
                          >
                            Add
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Members List */}
          <div className="border-t border-app-border dark:border-app-dark-border pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2.5">
              Members ({conversation.participants.length})
            </p>
            <div className="divide-y divide-app-border/60 dark:divide-app-dark-border/60 rounded-xl border border-app-border dark:border-app-dark-border overflow-hidden">
              {conversation.participants.map((p) => {
                const isMe = currentUser?._id === p.user._id;
                return (
                  <div
                    key={p.user._id}
                    className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-app-surface dark:bg-app-dark-surface"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={p.user.displayName}
                        src={p.user.avatar}
                        size="sm"
                        isOnline={p.user.isOnline}
                        showPresence={true}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold truncate">
                            {p.user.displayName} {isMe ? '(You)' : ''}
                          </span>
                          {p.role === 'admin' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-app-accent/15 text-app-accent text-[10px] font-bold">
                              <Shield className="w-2.5 h-2.5" />
                              Admin
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-app-muted truncate">@{p.user.username}</p>
                      </div>
                    </div>

                    {isAdmin && !isMe && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            roleMutation.mutate({
                              userId: p.user._id,
                              role: p.role === 'admin' ? 'member' : 'admin',
                            })
                          }
                          className="px-2 py-1 rounded-lg border border-app-border dark:border-app-dark-border text-[11px] font-medium hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
                        >
                          {p.role === 'admin' ? 'Demote' : 'Make Admin'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMemberMutation.mutate(p.user._id)}
                          title="Remove from group"
                          aria-label={`Remove ${p.user.displayName}`}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer: Leave Group */}
        <div className="px-5 py-3.5 border-t border-app-border dark:border-app-dark-border flex items-center justify-between bg-app-bg/40 dark:bg-app-dark-bg/40">
          <button
            type="button"
            disabled={leaveGroupMutation.isPending}
            onClick={() => leaveGroupMutation.mutate()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave Group</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal(null)}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-app-incoming dark:bg-app-dark-elevated"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
