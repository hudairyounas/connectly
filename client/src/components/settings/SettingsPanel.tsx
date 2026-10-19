import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Palette,
  Bell,
  Shield,
  KeyRound,
  Laptop,
  LogOut,
  Trash2,
  Sun,
  Moon,
  Monitor,
  ShieldCheck,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { api } from '../../lib/api/client';
import { socketService } from '../../lib/socket/socketService';
import { Avatar } from '../ui/Avatar';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export const SettingsPanel: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const setReducedMotion = useUIStore((s) => s.setReducedMotion);
  const addToast = useUIStore((s) => s.addToast);

  const queryClient = useQueryClient();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const { data: sessionsData } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.auth.getSessions(),
  });

  const { data: blockedData } = useQuery({
    queryKey: ['blocked-users'],
    queryFn: () => api.users.getBlocked(),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: api.settings.update,
    onSuccess: (res) => {
      queryClient.setQueryData(['settings'], res);
      updateUser({
        privacySettings: res.privacySettings,
        notificationSettings: res.notificationSettings,
        appearanceSettings: res.appearanceSettings,
      });
      addToast({ title: 'Settings saved', variant: 'success' });
    },
    onError: (err: Error) => {
      addToast({ title: 'Failed to save settings', description: err.message, variant: 'error' });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (userId: string) => api.users.unblock(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      addToast({ title: 'User unblocked', variant: 'info' });
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => api.auth.revokeSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      addToast({ title: 'Session revoked', variant: 'info' });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      api.users.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
      addToast({ title: 'Password updated successfully', variant: 'success' });
    },
    onError: (err: Error) => {
      setPasswordError(err.message);
    },
  });

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore error
    } finally {
      socketService.disconnect();
      clearAuth(false);
      navigate('/login', { replace: true });
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await api.users.deleteMe();
      socketService.disconnect();
      clearAuth(false);
      addToast({ title: 'Your account has been deleted', variant: 'info' });
      navigate('/', { replace: true });
    } catch (err) {
      addToast({
        title: 'Could not delete account',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  const privacy = settingsData?.privacySettings ||
    user?.privacySettings || {
      onlineVisibility: 'everyone',
      lastSeenVisibility: 'everyone',
      readReceipts: true,
      profileVisibility: 'everyone',
    };

  const notifications = settingsData?.notificationSettings ||
    user?.notificationSettings || {
      inAppEnabled: true,
      soundEnabled: true,
      showPreview: true,
    };

  const appearance = settingsData?.appearanceSettings ||
    user?.appearanceSettings || {
      theme,
      reducedMotion,
      enterToSend: true,
    };

  return (
    <div className="flex-1 overflow-y-auto bg-app-bg dark:bg-app-dark-bg p-4 sm:p-8 pb-24 md:pb-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-app-muted dark:text-app-dark-muted mt-1">
            Manage appearance, notifications, privacy controls, and account security
          </p>
        </div>

        {/* 1. Appearance Section */}
        <section className="rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-soft p-6 space-y-5">
          <div className="flex items-center gap-2.5 border-b border-app-border dark:border-app-dark-border pb-3">
            <Palette className="w-5 h-5 text-app-accent" />
            <h2 className="text-base font-bold">Appearance</h2>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(
              [
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'system', label: 'System', icon: Monitor },
              ] as const
            ).map((opt) => {
              const active = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setTheme(opt.id);
                    updateSettingsMutation.mutate({
                      appearanceSettings: { theme: opt.id },
                    });
                  }}
                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border text-xs font-semibold transition-all ${
                    active
                      ? 'border-app-accent bg-app-accent/10 text-app-accent ring-1 ring-app-accent'
                      : 'border-app-border dark:border-app-dark-border hover:bg-app-incoming dark:hover:bg-app-dark-elevated'
                  }`}
                >
                  <opt.icon className="w-5 h-5" />
                  <span>{opt.label} Theme</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-semibold">Reduced Motion</p>
                <p className="text-xs text-app-muted">
                  Minimize interface animations and transitions
                </p>
              </div>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => {
                  const val = e.target.checked;
                  setReducedMotion(val);
                  updateSettingsMutation.mutate({
                    appearanceSettings: { reducedMotion: val },
                  });
                }}
                className="w-4 h-4 accent-app-accent rounded"
              />
            </label>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-semibold">Press Enter to Send</p>
                <p className="text-xs text-app-muted">
                  Send messages with Enter (use Shift + Enter for a new line)
                </p>
              </div>
              <input
                type="checkbox"
                checked={appearance.enterToSend}
                onChange={(e) =>
                  updateSettingsMutation.mutate({
                    appearanceSettings: { enterToSend: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-app-accent rounded"
              />
            </label>
          </div>
        </section>

        {/* 2. Notifications Section */}
        <section className="rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-soft p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-app-border dark:border-app-dark-border pb-3">
            <Bell className="w-5 h-5 text-app-accent" />
            <h2 className="text-base font-bold">Notifications</h2>
          </div>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-semibold">In-App Notifications</p>
              <p className="text-xs text-app-muted">
                Show notification alerts for incoming messages and group activity
              </p>
            </div>
            <input
              type="checkbox"
              checked={notifications.inAppEnabled}
              onChange={(e) =>
                updateSettingsMutation.mutate({
                  notificationSettings: { inAppEnabled: e.target.checked },
                })
              }
              className="w-4 h-4 accent-app-accent rounded"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-semibold">Notification Sounds</p>
              <p className="text-xs text-app-muted">Play subtle sound effects on new messages</p>
            </div>
            <input
              type="checkbox"
              checked={notifications.soundEnabled}
              onChange={(e) =>
                updateSettingsMutation.mutate({
                  notificationSettings: { soundEnabled: e.target.checked },
                })
              }
              className="w-4 h-4 accent-app-accent rounded"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-semibold">Show Message Previews</p>
              <p className="text-xs text-app-muted">
                Include message text snippet inside notifications
              </p>
            </div>
            <input
              type="checkbox"
              checked={notifications.showPreview}
              onChange={(e) =>
                updateSettingsMutation.mutate({
                  notificationSettings: { showPreview: e.target.checked },
                })
              }
              className="w-4 h-4 accent-app-accent rounded"
            />
          </label>
        </section>

        {/* 3. Privacy & Blocked Users Section */}
        <section className="rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-soft p-6 space-y-5">
          <div className="flex items-center gap-2.5 border-b border-app-border dark:border-app-dark-border pb-3">
            <Shield className="w-5 h-5 text-app-accent" />
            <h2 className="text-base font-bold">Privacy & Visibility</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="privacy-online"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted mb-1"
              >
                Online Status Visibility
              </label>
              <select
                id="privacy-online"
                value={privacy.onlineVisibility}
                onChange={(e) =>
                  updateSettingsMutation.mutate({
                    privacySettings: {
                      onlineVisibility: e.target.value as 'everyone' | 'nobody',
                    },
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border"
              >
                <option value="everyone">Everyone</option>
                <option value="nobody">Nobody (Hide Online Status)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="privacy-last-seen"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted mb-1"
              >
                Last-Seen Visibility
              </label>
              <select
                id="privacy-last-seen"
                value={privacy.lastSeenVisibility}
                onChange={(e) =>
                  updateSettingsMutation.mutate({
                    privacySettings: {
                      lastSeenVisibility: e.target.value as 'everyone' | 'nobody',
                    },
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border"
              >
                <option value="everyone">Everyone</option>
                <option value="nobody">Nobody (Hide Last Seen)</option>
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-semibold">Read Receipts</p>
              <p className="text-xs text-app-muted">
                Let others see when you have read their messages
              </p>
            </div>
            <input
              type="checkbox"
              checked={privacy.readReceipts}
              onChange={(e) =>
                updateSettingsMutation.mutate({
                  privacySettings: { readReceipts: e.target.checked },
                })
              }
              className="w-4 h-4 accent-app-accent rounded"
            />
          </label>

          {/* Blocked Users List */}
          <div className="pt-3 border-t border-app-border dark:border-app-dark-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2.5">
              Blocked Users ({blockedData?.blockedUsers.length || 0})
            </h3>
            {!blockedData?.blockedUsers.length ? (
              <p className="text-xs text-app-muted py-2">You have not blocked any accounts.</p>
            ) : (
              <div className="divide-y divide-app-border/60 dark:divide-app-dark-border/60 rounded-xl border border-app-border dark:border-app-dark-border">
                {blockedData.blockedUsers.map((bu) => (
                  <div
                    key={bu._id}
                    className="flex items-center justify-between px-3.5 py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={bu.displayName} src={bu.avatar} size="xs" />
                      <div>
                        <p className="font-semibold">{bu.displayName}</p>
                        <p className="text-app-muted">@{bu.username}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => unblockMutation.mutate(bu._id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-app-border dark:border-app-dark-border font-semibold hover:bg-app-incoming"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-app-success" />
                      <span>Unblock</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 4. Account Security & Active Sessions */}
        <section className="rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-soft p-6 space-y-6">
          <div className="flex items-center gap-2.5 border-b border-app-border dark:border-app-dark-border pb-3">
            <KeyRound className="w-5 h-5 text-app-accent" />
            <h2 className="text-base font-bold">Account & Security</h2>
          </div>

          {/* Change Password Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPasswordError(null);
              changePasswordMutation.mutate();
            }}
            className="space-y-3"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted">
              Change Password
            </h3>
            {passwordError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400 font-medium">
                {passwordError}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                aria-label="Current password"
                className="px-3 py-2 text-xs rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border"
              />
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (8+ chars)"
                aria-label="New password"
                className="px-3 py-2 text-xs rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border"
              />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                aria-label="Confirm new password"
                className="px-3 py-2 text-xs rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border"
              />
            </div>
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="px-4 py-2 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white text-xs font-semibold"
            >
              {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
            </button>
          </form>

          {/* Active Sessions */}
          <div className="pt-4 border-t border-app-border dark:border-app-dark-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-app-muted" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-app-muted">
                  Active Sessions ({sessionsData?.sessions.length || 0})
                </h3>
              </div>
            </div>

            <div className="divide-y divide-app-border/60 dark:divide-app-dark-border/60 rounded-xl border border-app-border dark:border-app-dark-border">
              {(sessionsData?.sessions || []).map((s) => (
                <div
                  key={s._id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate max-w-xs">{s.userAgent}</span>
                      {s.isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold">
                          Current Device
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-app-muted mt-0.5">
                      IP: {s.ipAddress} · Last active {new Date(s.lastActiveAt).toLocaleString()}
                    </p>
                  </div>

                  {!s.isCurrent && (
                    <button
                      type="button"
                      onClick={() => revokeSessionMutation.mutate(s._id)}
                      className="px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60 font-semibold shrink-0"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Log out & Delete Account Actions */}
          <div className="pt-4 border-t border-app-border dark:border-app-dark-border flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-app-border dark:border-app-dark-border hover:bg-app-incoming dark:hover:bg-app-dark-elevated text-xs font-semibold"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out of This Device</span>
            </button>

            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 hover:bg-red-100 text-xs font-semibold"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Account</span>
            </button>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Permanently Delete Account?"
        description="Your profile and personal details will be permanently removed and all active sessions will be revoked immediately. This action cannot be undone."
        confirmLabel="Delete My Account"
        variant="danger"
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </div>
  );
};
