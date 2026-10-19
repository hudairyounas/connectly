import React, { useState } from 'react';
import {
  MessageSquareText,
  MessagesSquare,
  Users,
  UsersRound,
  Archive,
  Settings,
  Bell,
  Sun,
  Moon,
  CheckCheck,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore, NavSection } from '../../stores/uiStore';
import { api, APP_NAME } from '../../lib/api/client';
import { Avatar } from '../ui/Avatar';
import { formatConversationTime } from '../../lib/utils/format';

export const LeftNav: React.FC<{ totalUnreadChats: number }> = ({ totalUnreadChats }) => {
  const user = useAuthStore((s) => s.user);
  const activeNav = useUIStore((s) => s.activeNav);
  const setActiveNav = useUIStore((s) => s.setActiveNav);
  const setSelectedConversationId = useUIStore((s) => s.setSelectedConversationId);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const socketConnected = useUIStore((s) => s.socketConnected);

  const [notifOpen, setNotifOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
    staleTime: 15000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markOneReadMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const navItems: Array<{
    id: NavSection;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'chats', label: 'Chats', icon: MessagesSquare, badge: totalUnreadChats },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'groups', label: 'Groups', icon: UsersRound },
    { id: 'archived', label: 'Archived', icon: Archive },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const unreadNotifCount = notifData?.unreadCount || 0;

  return (
    <>
      {/* Desktop Vertical Sidebar */}
      <aside
        aria-label="Primary navigation"
        className="hidden md:flex flex-col justify-between items-center w-16 lg:w-[72px] shrink-0 py-4 bg-app-surface dark:bg-app-dark-surface border-r border-app-border dark:border-app-dark-border select-none z-20"
      >
        <div className="flex flex-col items-center gap-5 w-full">
          {/* Brand Logo */}
          <button
            type="button"
            onClick={() => setActiveNav('chats')}
            title={APP_NAME}
            aria-label={APP_NAME}
            className="relative w-10 h-10 rounded-xl bg-app-accent flex items-center justify-center text-white shadow-soft hover:bg-app-accent-hover transition-colors"
          >
            <MessageSquareText className="w-5 h-5" />
            <span
              title={socketConnected ? 'Real-time connected' : 'Reconnecting...'}
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-app-surface dark:ring-app-dark-surface ${
                socketConnected ? 'bg-app-success' : 'bg-amber-500 animate-pulse'
              }`}
            />
          </button>

          {/* Navigation Icons */}
          <nav className="flex flex-col items-center gap-2 w-full px-2">
            {navItems.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveNav(item.id)}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-app-accent text-white shadow-soft'
                      : 'text-app-muted dark:text-app-dark-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated hover:text-app-text dark:hover:text-app-dark-text'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions: Notifications, Theme, User Profile */}
        <div className="flex flex-col items-center gap-3 w-full px-2 relative">
          {/* Notifications Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              title="Notifications"
              aria-label="Notifications"
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                notifOpen
                  ? 'bg-app-accent/15 text-app-accent'
                  : 'text-app-muted dark:text-app-dark-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated'
              }`}
            >
              <Bell className="w-5 h-5" />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-app-surface dark:ring-app-dark-surface" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute left-14 bottom-0 w-80 max-h-96 flex flex-col rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-app-border dark:border-app-dark-border flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">Notifications</span>
                  {unreadNotifCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllReadMutation.mutate()}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-app-accent hover:underline"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Mark all read</span>
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-app-border/60 dark:divide-app-dark-border/60">
                  {!notifData?.notifications.length ? (
                    <div className="p-6 text-center text-xs text-app-muted">
                      No notifications yet
                    </div>
                  ) : (
                    notifData.notifications.map((n) => (
                      <button
                        key={n._id}
                        type="button"
                        onClick={() => {
                          if (!n.isRead) markOneReadMutation.mutate(n._id);
                          if (n.conversationId) {
                            setActiveNav('chats');
                            setSelectedConversationId(n.conversationId);
                          }
                          setNotifOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-app-incoming/60 dark:hover:bg-app-dark-elevated/60 transition-colors ${
                          !n.isRead ? 'bg-app-accent/5 dark:bg-app-accent/10' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold truncate">{n.title}</span>
                          <span className="text-[10px] text-app-muted shrink-0">
                            {formatConversationTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-app-muted dark:text-app-dark-muted mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Theme Switcher */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-app-muted dark:text-app-dark-muted hover:bg-app-incoming dark:hover:bg-app-dark-elevated transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Current User Profile Button */}
          {user && (
            <button
              type="button"
              onClick={() => setActiveNav('profile')}
              title={`${user.displayName} (@${user.username})`}
              aria-label="My Profile"
              className={`p-0.5 rounded-full transition-transform ${
                activeNav === 'profile' ? 'ring-2 ring-app-accent scale-105' : ''
              }`}
            >
              <Avatar
                name={user.displayName}
                src={user.avatar}
                size="sm"
                isOnline={true}
                availability={user.availability}
                showPresence={true}
              />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 h-16 bg-app-surface dark:bg-app-dark-surface border-t border-app-border dark:border-app-dark-border flex items-center justify-around px-2 z-30"
      >
        {navItems.map((item) => {
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              aria-label={item.label}
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl text-xs font-medium transition-colors ${
                isActive
                  ? 'text-app-accent font-semibold'
                  : 'text-app-muted dark:text-app-dark-muted'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="absolute top-0.5 right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setActiveNav('profile')}
          aria-label="Profile"
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl text-xs font-medium ${
            activeNav === 'profile'
              ? 'text-app-accent font-semibold'
              : 'text-app-muted dark:text-app-dark-muted'
          }`}
        >
          {user && <Avatar name={user.displayName} src={user.avatar} size="xs" />}
          <span className="text-[10px] mt-0.5">Profile</span>
        </button>
      </nav>
    </>
  );
};
