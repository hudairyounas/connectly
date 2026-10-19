import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Trash2, Check, CheckCircle2, AlertCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { api, ApiClientError } from '../../lib/api/client';
import { Avatar } from '../ui/Avatar';

export const ProfilePanel: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const addToast = useUIStore((s) => s.addToast);

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [statusText, setStatusText] = useState(user?.statusText || 'Available');
  const [availability, setAvailability] = useState<'online' | 'away' | 'busy' | 'offline'>(
    user?.availability || 'online',
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setUsername(user.username);
      setBio(user.bio || '');
      setStatusText(user.statusText || 'Available');
      setAvailability(user.availability || 'online');
    }
  }, [user]);

  const saveProfileMutation = useMutation({
    mutationFn: () =>
      api.users.updateMe({
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
        statusText: statusText.trim(),
        availability,
      }),
    onSuccess: (res) => {
      updateUser(res.user);
      setErrorMsg(null);
      addToast({ title: 'Profile updated successfully', variant: 'success' });
    },
    onError: (err: Error) => {
      setErrorMsg(err instanceof ApiClientError ? err.message : 'Failed to update profile');
    },
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await api.users.uploadAvatar(file);
      const res = await api.users.updateMe({ avatar: uploaded.avatarUrl });
      updateUser(res.user);
      addToast({ title: 'Avatar updated', variant: 'success' });
    } catch (err) {
      addToast({
        title: 'Avatar upload failed',
        description: err instanceof Error ? err.message : 'Invalid image file',
        variant: 'error',
      });
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      const res = await api.users.updateMe({ avatar: null });
      updateUser(res.user);
      addToast({ title: 'Avatar removed', variant: 'info' });
    } catch (err) {
      addToast({
        title: 'Failed to remove avatar',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    }
  };

  if (!user) return null;

  return (
    <div className="flex-1 overflow-y-auto bg-app-bg dark:bg-app-dark-bg p-4 sm:p-8 pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your Profile</h1>
          <p className="text-sm text-app-muted dark:text-app-dark-muted mt-1">
            Customize your public identity, availability, and bio across conversations
          </p>
        </div>

        {/* Email verification notice */}
        <div className="p-4 rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {user.emailVerified ? (
              <CheckCircle2 className="w-5 h-5 text-app-success shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            )}
            <div>
              <p className="text-xs font-semibold">
                {user.email}{' '}
                <span
                  className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    user.emailVerified
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {user.emailVerified ? 'Verified' : 'Unverified'}
                </span>
              </p>
              <p className="text-xs text-app-muted mt-0.5">
                {user.emailVerified
                  ? 'Your email address is confirmed.'
                  : 'Verify your email address to secure account recovery.'}
              </p>
            </div>
          </div>

          {!user.emailVerified && (
            <Link
              to="/verify-email"
              className="px-3.5 py-1.5 rounded-xl bg-app-accent text-white text-xs font-semibold hover:bg-app-accent-hover shrink-0"
            >
              Verify Email
            </Link>
          )}
        </div>

        <div className="rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-soft p-6 space-y-6">
          {/* Avatar Section */}
          <div className="flex flex-wrap items-center gap-5 pb-6 border-b border-app-border dark:border-app-dark-border">
            <Avatar
              name={user.displayName}
              src={user.avatar}
              size="xl"
              isOnline={true}
              availability={availability}
              showPresence={true}
            />

            <div className="space-y-2">
              <h2 className="text-base font-bold">{user.displayName}</h2>
              <p className="text-xs text-app-muted">
                PNG, JPEG, WebP, or GIF up to 10 MB. Verified via binary signature check.
              </p>
              <div className="flex items-center gap-2.5 pt-1">
                <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white text-xs font-semibold cursor-pointer shadow-soft transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Photo</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>

                {user.avatar && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-600 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium"
            >
              {errorMsg}
            </div>
          )}

          {/* Profile Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveProfileMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="profile-display-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-app-muted mb-1.5"
                >
                  Display Name
                </label>
                <input
                  id="profile-display-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-username"
                  className="block text-xs font-semibold uppercase tracking-wider text-app-muted mb-1.5"
                >
                  Username
                </label>
                <input
                  id="profile-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="profile-availability"
                  className="block text-xs font-semibold uppercase tracking-wider text-app-muted mb-1.5"
                >
                  Availability Status
                </label>
                <select
                  id="profile-availability"
                  value={availability}
                  onChange={(e) =>
                    setAvailability(
                      e.target.value as 'online' | 'away' | 'busy' | 'offline',
                    )
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent"
                >
                  <option value="online">Online</option>
                  <option value="away">Away</option>
                  <option value="busy">Busy / Do Not Disturb</option>
                  <option value="offline">Appear Offline</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="profile-status-text"
                  className="block text-xs font-semibold uppercase tracking-wider text-app-muted mb-1.5"
                >
                  Custom Status Note
                </label>
                <input
                  id="profile-status-text"
                  type="text"
                  maxLength={80}
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder="Available, In a meeting..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="profile-bio"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted mb-1.5"
              >
                Bio ({bio.length}/250)
              </label>
              <textarea
                id="profile-bio"
                rows={3}
                maxLength={250}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Write a short bio about yourself..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent resize-none"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={saveProfileMutation.isPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white text-sm font-semibold shadow-soft disabled:opacity-50 transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>{saveProfileMutation.isPending ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
