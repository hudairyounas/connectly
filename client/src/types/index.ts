export interface PrivacySettings {
  onlineVisibility: 'everyone' | 'nobody';
  lastSeenVisibility: 'everyone' | 'nobody';
  readReceipts: boolean;
  profileVisibility: 'everyone' | 'contacts';
}

export interface NotificationSettings {
  inAppEnabled: boolean;
  soundEnabled: boolean;
  showPreview: boolean;
}

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  reducedMotion: boolean;
  enterToSend: boolean;
}

export interface User {
  _id: string;
  displayName: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  avatar: string | null;
  bio: string;
  statusText: string;
  availability: 'online' | 'away' | 'busy' | 'offline';
  isOnline: boolean;
  lastSeenAt: string | null;
  isDeleted?: boolean;
  isBlockedByMe?: boolean;
  hasBlockedMe?: boolean;
  blockedUsers?: string[];
  privacySettings?: PrivacySettings;
  notificationSettings?: NotificationSettings;
  appearanceSettings?: AppearanceSettings;
  createdAt?: string;
}

export interface ConversationParticipant {
  user: User;
  role: 'admin' | 'member';
  joinedAt: string;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
}

export interface ConversationMySettings {
  role: 'admin' | 'member';
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
}

export interface LastMessagePreview {
  messageId: string;
  contentPreview: string;
  senderId: string;
  type: 'text' | 'attachment' | 'system';
  createdAt: string;
}

export interface Conversation {
  _id: string;
  type: 'direct' | 'group';
  groupName: string | null;
  groupDescription: string;
  groupAvatar: string | null;
  createdBy: string;
  peer: User | null;
  participants: ConversationParticipant[];
  mySettings: ConversationMySettings;
  lastMessage: LastMessagePreview | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  _id: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'document';
  url: string;
  createdAt?: string;
}

export interface ReplyPreview {
  _id: string;
  content: string;
  type: string;
  isDeletedForEveryone: boolean;
  sender: {
    _id: string;
    displayName: string;
  };
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
  count: number;
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  sender: User;
  clientMessageId?: string;
  type: 'text' | 'attachment' | 'system';
  content: string;
  attachments: Attachment[];
  replyTo: ReplyPreview | null;
  reactions: MessageReaction[];
  deliveredTo: string[];
  readBy: string[];
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  isDeletedForEveryone: boolean;
  deletedAt: string | null;
  editedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  errorMessage?: string;
}

export interface AppNotification {
  _id: string;
  type: 'message' | 'group_invite' | 'group_role' | 'system';
  title: string;
  body: string;
  conversationId: string | null;
  actorId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface UserSession {
  _id: string;
  userAgent: string;
  ipAddress: string;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}
