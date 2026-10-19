import { useAuthStore } from '../../stores/authStore';
import {
  User,
  Conversation,
  Message,
  Attachment,
  AppNotification,
  UserSession,
  PrivacySettings,
  NotificationSettings,
  AppearanceSettings,
} from '../../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Connectly';

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, string[]>;

  constructor(
    message: string,
    statusCode = 400,
    code = 'API_ERROR',
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

let refreshPromise: Promise<string | null> | null = null;

export async function refreshSessionToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        return null;
      }

      const json = await res.json();
      if (json.success && json.data?.accessToken && json.data?.user) {
        useAuthStore
          .getState()
          .setAuth(json.data.user, json.data.accessToken, json.data.sessionId);
        return json.data.accessToken as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { skipAuthRefresh?: boolean } = {},
): Promise<T> {
  const { skipAuthRefresh, ...fetchOptions } = options;
  const token = useAuthStore.getState().accessToken;

  const headers = new Headers(fetchOptions.headers || {});
  if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !skipAuthRefresh && !path.startsWith('/auth/login')) {
    const newToken = await refreshSessionToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });
    } else {
      const wasAuthenticated = useAuthStore.getState().isAuthenticated;
      useAuthStore.getState().clearAuth(wasAuthenticated);
    }
  }

  const json = await res.json().catch(() => ({
    success: false,
    error: { code: 'NETWORK_ERROR', message: 'Invalid server response' },
  }));

  if (!res.ok || !json.success) {
    throw new ApiClientError(
      json.error?.message || 'Request failed',
      res.status,
      json.error?.code || 'API_ERROR',
      json.error?.details,
    );
  }

  return json.data as T;
}

export function uploadAttachmentWithProgress(params: {
  file: File;
  conversationId: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<{ attachment: Attachment }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('conversationId', params.conversationId);

    xhr.open('POST', `${API_BASE}/attachments/upload`, true);
    xhr.withCredentials = true;

    const token = useAuthStore.getState().accessToken;
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (params.signal) {
      params.signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new ApiClientError('Upload cancelled', 499, 'UPLOAD_CANCELLED'));
      });
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && params.onProgress) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        params.onProgress(pct);
      }
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json.success) {
          resolve(json.data);
        } else {
          reject(
            new ApiClientError(
              json.error?.message || 'File upload failed',
              xhr.status,
              json.error?.code || 'UPLOAD_ERROR',
            ),
          );
        }
      } catch {
        reject(new ApiClientError('File upload failed', xhr.status, 'UPLOAD_ERROR'));
      }
    };

    xhr.onerror = () => {
      reject(new ApiClientError('Network error during file upload', 500, 'NETWORK_ERROR'));
    };

    xhr.send(formData);
  });
}

export const api = {
  auth: {
    register: (body: {
      displayName: string;
      username: string;
      email: string;
      password: string;
      confirmPassword: string;
    }) =>
      apiRequest<{ user: User; accessToken: string; sessionId: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
        skipAuthRefresh: true,
      }),
    login: (body: { identifier: string; password: string }) =>
      apiRequest<{ user: User; accessToken: string; sessionId: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
        skipAuthRefresh: true,
      }),
    logout: () =>
      apiRequest<{ message: string }>('/auth/logout', {
        method: 'POST',
        skipAuthRefresh: true,
      }),
    logoutAll: () =>
      apiRequest<{ message: string }>('/auth/logout-all', {
        method: 'POST',
      }),
    getSessions: () => apiRequest<{ sessions: UserSession[] }>('/auth/sessions'),
    revokeSession: (sessionId: string) =>
      apiRequest<{ message: string }>(`/auth/sessions/${sessionId}`, {
        method: 'DELETE',
      }),
    forgotPassword: (email: string) =>
      apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipAuthRefresh: true,
      }),
    resetPassword: (body: { token: string; password: string; confirmPassword: string }) =>
      apiRequest<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(body),
        skipAuthRefresh: true,
      }),
    verifyEmail: (token: string) =>
      apiRequest<{ message: string; user: User }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
        skipAuthRefresh: true,
      }),
    getDevOutbox: (email: string) =>
      apiRequest<{
        smtpConfigured: boolean;
        email: string;
        verifyEmailToken: string | null;
        resetPasswordToken: string | null;
      }>(`/auth/dev-outbox?email=${encodeURIComponent(email)}`, {
        skipAuthRefresh: true,
      }),
  },

  users: {
    getMe: () => apiRequest<{ user: User }>('/users/me'),
    updateMe: (body: Partial<Pick<User, 'displayName' | 'username' | 'bio' | 'statusText' | 'availability' | 'avatar'>>) =>
      apiRequest<{ user: User }>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    changePassword: (body: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) =>
      apiRequest<{ message: string }>('/users/me/change-password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    deleteMe: () =>
      apiRequest<{ message: string }>('/users/me', {
        method: 'DELETE',
      }),
    search: (q: string) =>
      apiRequest<{ users: User[] }>(`/users/search?q=${encodeURIComponent(q)}`),
    getById: (userId: string) => apiRequest<{ user: User }>(`/users/${userId}`),
    getBlocked: () => apiRequest<{ blockedUsers: User[] }>('/users/me/blocked'),
    block: (userId: string) =>
      apiRequest<{ message: string }>(`/users/${userId}/block`, { method: 'POST' }),
    unblock: (userId: string) =>
      apiRequest<{ message: string }>(`/users/${userId}/block`, { method: 'DELETE' }),
    uploadAvatar: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiRequest<{ avatarUrl: string }>('/attachments/avatar', {
        method: 'POST',
        body: formData,
      });
    },
  },

  conversations: {
    list: () => apiRequest<{ conversations: Conversation[] }>('/conversations'),
    createDirect: (participantId: string) =>
      apiRequest<{ conversation: Conversation; createdNew: boolean }>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ participantId }),
      }),
    getById: (conversationId: string) =>
      apiRequest<{ conversation: Conversation }>(`/conversations/${conversationId}`),
    updateSettings: (
      conversationId: string,
      settings: { isMuted?: boolean; isPinned?: boolean; isArchived?: boolean },
    ) =>
      apiRequest<{ conversation: Conversation }>(`/conversations/${conversationId}`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }),
    getMessages: (conversationId: string, cursor?: string, limit = 30) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return apiRequest<{ messages: Message[]; nextCursor: string | null; hasMore: boolean }>(
        `/conversations/${conversationId}/messages?${params.toString()}`,
      );
    },
    sendMessage: (
      conversationId: string,
      body: {
        content: string;
        clientMessageId?: string;
        replyTo?: string | null;
        attachmentIds?: string[];
      },
    ) =>
      apiRequest<{ message: Message; conversation: Conversation; deduplicated: boolean }>(
        `/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      ),
    markRead: (conversationId: string, messageId?: string) =>
      apiRequest<{ conversationId: string; lastReadMessageId: string | null; readAt: string }>(
        `/conversations/${conversationId}/read`,
        {
          method: 'POST',
          body: JSON.stringify(messageId ? { messageId } : {}),
        },
      ),
    searchMessages: (conversationId: string, q: string) =>
      apiRequest<{ messages: Message[] }>(
        `/conversations/${conversationId}/search?q=${encodeURIComponent(q)}`,
      ),
  },

  messages: {
    edit: (messageId: string, content: string) =>
      apiRequest<{ message: Message }>(`/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    delete: (messageId: string, mode: 'self' | 'everyone' = 'everyone') =>
      apiRequest<{
        messageId: string;
        conversationId: string;
        mode: 'self' | 'everyone';
        isDeletedForEveryone: boolean;
      }>(`/messages/${messageId}?mode=${mode}`, {
        method: 'DELETE',
      }),
    toggleReaction: (messageId: string, emoji: string) =>
      apiRequest<{
        messageId: string;
        conversationId: string;
        reactions: Message['reactions'];
      }>(`/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
  },

  groups: {
    create: (body: {
      groupName: string;
      groupDescription?: string;
      groupAvatar?: string | null;
      participantIds: string[];
    }) =>
      apiRequest<{ conversation: Conversation }>('/groups', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (
      groupId: string,
      body: { groupName?: string; groupDescription?: string; groupAvatar?: string | null },
    ) =>
      apiRequest<{ conversation: Conversation }>(`/groups/${groupId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    addMembers: (groupId: string, participantIds: string[]) =>
      apiRequest<{ conversation: Conversation }>(`/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ participantIds }),
      }),
    removeMember: (groupId: string, userId: string) =>
      apiRequest<{ conversation: Conversation }>(`/groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
      }),
    leave: (groupId: string) =>
      apiRequest<{ groupId: string; left: boolean }>(`/groups/${groupId}/leave`, {
        method: 'POST',
      }),
    updateRole: (groupId: string, userId: string, role: 'admin' | 'member') =>
      apiRequest<{ conversation: Conversation }>(`/groups/${groupId}/members/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
  },

  settings: {
    get: () =>
      apiRequest<{
        privacySettings: PrivacySettings;
        notificationSettings: NotificationSettings;
        appearanceSettings: AppearanceSettings;
      }>('/settings'),
    update: (body: {
      privacySettings?: Partial<PrivacySettings>;
      notificationSettings?: Partial<NotificationSettings>;
      appearanceSettings?: Partial<AppearanceSettings>;
    }) =>
      apiRequest<{
        privacySettings: PrivacySettings;
        notificationSettings: NotificationSettings;
        appearanceSettings: AppearanceSettings;
      }>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  notifications: {
    list: () =>
      apiRequest<{ notifications: AppNotification[]; unreadCount: number }>('/notifications'),
    markRead: (notificationId: string) =>
      apiRequest<{ notification: { _id: string; isRead: boolean } }>(
        `/notifications/${notificationId}/read`,
        { method: 'PATCH' },
      ),
    markAllRead: () =>
      apiRequest<{ message: string }>('/notifications/read-all', { method: 'POST' }),
  },
};
