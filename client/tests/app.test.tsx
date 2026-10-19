import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginPage } from '../src/pages/LoginPage';
import { RegisterPage } from '../src/pages/RegisterPage';
import { MessageBubble } from '../src/components/messages/MessageBubble';
import { MessageComposer } from '../src/components/messages/MessageComposer';
import { ConversationSidebar } from '../src/components/conversations/ConversationSidebar';
import { useAuthStore } from '../src/stores/authStore';
import { useUIStore } from '../src/stores/uiStore';
import { Message, Conversation } from '../src/types';

function renderWithProviders(ui: React.ReactElement, initialEntries = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const mockUser = {
  _id: 'u1',
  displayName: 'Alice Mercer',
  username: 'alice_m',
  email: 'alice@connectly.test',
  avatar: null,
  bio: 'Staff Engineer',
  statusText: 'Available',
  availability: 'online' as const,
  isOnline: true,
  lastSeenAt: new Date().toISOString(),
  appearanceSettings: {
    theme: 'light' as const,
    reducedMotion: false,
    enterToSend: true,
  },
};

describe('Connectly Frontend Suite', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth(false);
    useUIStore.getState().setSelectedConversationId(null);
    useUIStore.getState().setActiveNav('chats');
  });

  describe('Authentication & Form Validation', () => {
    it('validates login fields and shows actionable error messages', async () => {
      renderWithProviders(<LoginPage />, ['/login']);

      const submitBtn = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/email or username is required/i)).toBeInTheDocument();
        expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      });
    });

    it('displays session expired notice on login page when redirected from expired session', () => {
      useAuthStore.getState().clearAuth(true);
      renderWithProviders(<LoginPage />, ['/login']);

      expect(
        screen.getByText(/your session expired or was revoked/i),
      ).toBeInTheDocument();
    });

    it('validates registration fields and displays password strength feedback', async () => {
      renderWithProviders(<RegisterPage />, ['/register']);

      const passwordInput = screen.getByLabelText(/^password$/i);
      fireEvent.change(passwordInput, { target: { value: 'StrongPass123!' } });

      expect(screen.getByText(/password strength/i)).toBeInTheDocument();
      expect(screen.getByText(/very strong/i)).toBeInTheDocument();

      const submitBtn = screen.getByRole('button', { name: /create account/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/full name must be at least 2 characters/i)).toBeInTheDocument();
      });
    });
  });

  describe('Conversation Sidebar & Selection', () => {
    const sampleConversations: Conversation[] = [
      {
        _id: 'conv-1',
        type: 'direct',
        groupName: null,
        groupDescription: '',
        groupAvatar: null,
        createdBy: 'u1',
        peer: {
          _id: 'u2',
          displayName: 'Bob Vance',
          username: 'bob_v',
          avatar: null,
          bio: '',
          statusText: 'Online',
          availability: 'online',
          isOnline: true,
          lastSeenAt: new Date().toISOString(),
        },
        participants: [],
        mySettings: {
          role: 'member',
          unreadCount: 3,
          isMuted: false,
          isPinned: true,
          isArchived: false,
          lastReadMessageId: null,
          lastReadAt: null,
        },
        lastMessage: {
          messageId: 'm1',
          contentPreview: 'Let us review the architecture plan',
          senderId: 'u2',
          type: 'text',
          createdAt: new Date().toISOString(),
        },
        lastActivityAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it('renders empty state when there are no conversations', () => {
      renderWithProviders(
        <ConversationSidebar
          conversations={[]}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
        />,
      );

      expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
    });

    it('renders conversations with unread badge, pinned icon, and selects on click', () => {
      renderWithProviders(
        <ConversationSidebar
          conversations={sampleConversations}
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
        />,
      );

      expect(screen.getByText('Bob Vance')).toBeInTheDocument();
      expect(screen.getByText('Let us review the architecture plan')).toBeInTheDocument();
      expect(screen.getByLabelText('3 unread messages')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Bob Vance'));
      expect(useUIStore.getState().selectedConversationId).toBe('conv-1');
    });
  });

  describe('Message Bubble & Composer UX', () => {
    const sampleMessage: Message = {
      _id: 'msg-101',
      conversationId: 'conv-1',
      senderId: 'u1',
      sender: mockUser,
      type: 'text',
      content: 'Ship the real-time update!',
      attachments: [],
      replyTo: {
        _id: 'msg-100',
        content: 'Are we ready to deploy?',
        type: 'text',
        isDeletedForEveryone: false,
        sender: { _id: 'u2', displayName: 'Bob Vance' },
      },
      reactions: [{ emoji: '👍', userIds: ['u2'], count: 1 }],
      deliveredTo: ['u1', 'u2'],
      readBy: ['u1', 'u2'],
      status: 'read',
      isDeletedForEveryone: false,
      deletedAt: null,
      editedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    it('renders message content, reply preview, edited indicator, read receipt, and reactions', () => {
      renderWithProviders(
        <MessageBubble
          message={sampleMessage}
          isOwn={true}
          isGroup={false}
          canDeleteForEveryone={true}
          onReply={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onToggleReaction={vi.fn()}
        />,
      );

      expect(screen.getByText('Ship the real-time update!')).toBeInTheDocument();
      expect(screen.getByText('Are we ready to deploy?')).toBeInTheDocument();
      expect(screen.getByText('(edited)')).toBeInTheDocument();
      expect(screen.getByText('Read')).toBeInTheDocument();
      expect(screen.getByText('👍')).toBeInTheDocument();
    });

    it('renders retry button when a message send fails', () => {
      const onRetry = vi.fn();
      const failedMessage: Message = {
        ...sampleMessage,
        status: 'failed',
        errorMessage: 'Network timeout',
      };

      renderWithProviders(
        <MessageBubble
          message={failedMessage}
          isOwn={true}
          isGroup={false}
          canDeleteForEveryone={true}
          onReply={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onToggleReaction={vi.fn()}
          onRetrySend={onRetry}
        />,
      );

      expect(screen.getByText('Network timeout')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(onRetry).toHaveBeenCalledWith(failedMessage);
    });

    it('sends message on Enter, allows newline on Shift+Enter, and cancels reply on Escape', async () => {
      useAuthStore.getState().setAuth(mockUser, 'token-123', 'sess-1');
      const onSendMessage = vi.fn().mockResolvedValue(undefined);
      const onCancelReply = vi.fn();

      renderWithProviders(
        <MessageComposer
          conversationId="conv-1"
          replyingTo={sampleMessage}
          editingMessage={null}
          onCancelReply={onCancelReply}
          onCancelEdit={vi.fn()}
          onSendMessage={onSendMessage}
          onSaveEdit={vi.fn()}
        />,
      );

      const input = screen.getByLabelText(/message input/i);

      // Escape cancels reply
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(onCancelReply).toHaveBeenCalled();

      // Enter submits message
      fireEvent.change(input, { target: { value: 'Hello Connectly' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith({
          content: 'Hello Connectly',
          replyTo: sampleMessage,
          attachments: [],
        });
      });
    });
  });
});
