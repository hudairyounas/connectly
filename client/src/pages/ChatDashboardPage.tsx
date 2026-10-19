import React, { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { api } from '../lib/api/client';
import { socketService } from '../lib/socket/socketService';
import { LeftNav } from '../components/layout/LeftNav';
import { ConversationSidebar } from '../components/conversations/ConversationSidebar';
import { ChatPanel } from '../components/messages/ChatPanel';
import { ProfilePanel } from '../components/profile/ProfilePanel';
import { SettingsPanel } from '../components/settings/SettingsPanel';
import { NewChatModal } from '../components/conversations/NewChatModal';
import { CreateGroupModal } from '../components/conversations/CreateGroupModal';
import { UserProfileModal } from '../components/profile/UserProfileModal';
import { GroupInfoModal } from '../components/conversations/GroupInfoModal';

export const ChatDashboardPage: React.FC = () => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const activeNav = useUIStore((s) => s.activeNav);
  const selectedConversationId = useUIStore((s) => s.selectedConversationId);
  const socketConnected = useUIStore((s) => s.socketConnected);
  const setTheme = useUIStore((s) => s.setTheme);
  const setReducedMotion = useUIStore((s) => s.setReducedMotion);

  const queryClient = useQueryClient();

  // Connect Socket.IO and bind queryClient
  useEffect(() => {
    socketService.setQueryClient(queryClient);
    if (accessToken) {
      socketService.connect(accessToken);
    }
    return () => {
      socketService.scheduleDisconnect();
    };
  }, [accessToken, queryClient]);

  // Apply user's persisted theme & reducedMotion settings when user loads
  useEffect(() => {
    if (user?.appearanceSettings) {
      setTheme(user.appearanceSettings.theme);
      setReducedMotion(Boolean(user.appearanceSettings.reducedMotion));
    }
  }, [user?.appearanceSettings, setTheme, setReducedMotion]);

  const {
    data: convData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.conversations.list(),
  });

  const conversations = convData?.conversations || [];
  const selectedConversation =
    conversations.find((c) => c._id === selectedConversationId) || null;

  const totalUnreadChats = conversations.reduce(
    (sum, c) => sum + (c.mySettings.isArchived ? 0 : c.mySettings.unreadCount || 0),
    0,
  );

  const isSettingsOrProfile = activeNav === 'settings' || activeNav === 'profile';

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-app-bg dark:bg-app-dark-bg text-app-text dark:text-app-dark-text">
      {/* Socket Disconnection / Reconnection Banner */}
      {!socketConnected && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-500 text-white text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-2 shrink-0 z-30"
        >
          <WifiOff className="w-3.5 h-3.5 animate-pulse" />
          <span>Reconnecting to real-time messaging server...</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <LeftNav totalUnreadChats={totalUnreadChats} />

        {isSettingsOrProfile ? (
          activeNav === 'profile' ? (
            <ProfilePanel />
          ) : (
            <SettingsPanel />
          )
        ) : (
          <>
            {/* Conversation Sidebar: visible on desktop always; on mobile only when no conversation is open */}
            <div
              className={`${
                selectedConversation ? 'hidden md:flex' : 'flex'
              } w-full md:w-auto h-full`}
            >
              <ConversationSidebar
                conversations={conversations}
                isLoading={isLoading}
                isError={isError}
                onRetry={() => void refetch()}
              />
            </div>

            {/* Primary Chat Panel: visible on desktop always; on mobile full-screen when a conversation is selected */}
            <div
              className={`${
                selectedConversation ? 'flex' : 'hidden md:flex'
              } flex-1 h-full overflow-hidden`}
            >
              <ChatPanel conversation={selectedConversation} />
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <NewChatModal />
      <CreateGroupModal />
      <UserProfileModal />
      <GroupInfoModal />
    </div>
  );
};
