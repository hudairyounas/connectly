import { create } from 'zustand';

export type NavSection = 'chats' | 'contacts' | 'groups' | 'archived' | 'settings' | 'profile';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: 'success' | 'error' | 'info';
}

export interface TypingUser {
  userId: string;
  displayName: string;
}

interface UIState {
  activeNav: NavSection;
  selectedConversationId: string | null;
  theme: 'light' | 'dark' | 'system';
  reducedMotion: boolean;
  socketConnected: boolean;
  toasts: ToastItem[];
  typingByConversation: Record<string, TypingUser[]>;
  activeModal:
    | null
    | { type: 'new-chat' }
    | { type: 'create-group' }
    | { type: 'user-profile'; userId: string }
    | { type: 'group-info'; conversationId: string };
  setActiveNav: (nav: NavSection) => void;
  setSelectedConversationId: (id: string | null) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setReducedMotion: (reduced: boolean) => void;
  setSocketConnected: (connected: boolean) => void;
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  setTypingState: (
    conversationId: string,
    userId: string,
    displayName: string,
    isTyping: boolean,
  ) => void;
  setActiveModal: (modal: UIState['activeModal']) => void;
}

function applyThemeToDocument(theme: 'light' | 'dark' | 'system', reducedMotion: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
  root.classList.toggle('reduce-motion', reducedMotion);
}

const initialTheme =
  (typeof localStorage !== 'undefined' &&
    (localStorage.getItem('connectly_theme') as 'light' | 'dark' | 'system')) ||
  'light';

export const useUIStore = create<UIState>((set, get) => ({
  activeNav: 'chats',
  selectedConversationId: null,
  theme: initialTheme,
  reducedMotion: false,
  socketConnected: false,
  toasts: [],
  typingByConversation: {},
  activeModal: null,

  setActiveNav: (nav) => set({ activeNav: nav }),

  setSelectedConversationId: (id) => set({ selectedConversationId: id }),

  setTheme: (theme) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('connectly_theme', theme);
    }
    applyThemeToDocument(theme, get().reducedMotion);
    set({ theme });
  },

  setReducedMotion: (reduced) => {
    applyThemeToDocument(get().theme, reduced);
    set({ reducedMotion: reduced });
  },

  setSocketConnected: (connected) => set({ socketConnected: connected }),

  addToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { ...toast, id }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4500);
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setTypingState: (conversationId, userId, displayName, isTyping) =>
    set((state) => {
      const current = state.typingByConversation[conversationId] || [];
      const filtered = current.filter((u) => u.userId !== userId);
      const next = isTyping ? [...filtered, { userId, displayName }] : filtered;
      return {
        typingByConversation: {
          ...state.typingByConversation,
          [conversationId]: next,
        },
      };
    }),

  setActiveModal: (modal) => set({ activeModal: modal }),
}));
