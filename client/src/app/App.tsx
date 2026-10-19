import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageSquareText } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { refreshSessionToken, APP_NAME } from '../lib/api/client';
import { ToastViewport } from '../components/ui/ToastViewport';

const LandingPage = lazy(() =>
  import('../pages/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const LoginPage = lazy(() =>
  import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('../pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('../pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('../pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const VerifyEmailPage = lazy(() =>
  import('../pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })),
);
const ChatDashboardPage = lazy(() =>
  import('../pages/ChatDashboardPage').then((m) => ({ default: m.ChatDashboardPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitializing = useAuthStore((s) => s.isInitializing);

  if (isInitializing) {
    return (
      <div
        role="status"
        aria-label="Checking authentication"
        className="h-screen w-screen flex flex-col items-center justify-center bg-app-bg dark:bg-app-dark-bg text-app-text dark:text-app-dark-text gap-3"
      >
        <div className="w-11 h-11 rounded-2xl bg-app-accent flex items-center justify-center text-white shadow-soft animate-pulse">
          <MessageSquareText className="w-6 h-6" />
        </div>
        <p className="text-xs font-semibold text-app-muted">Loading {APP_NAME}...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  const setInitializing = useAuthStore((s) => s.setInitializing);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  useEffect(() => {
    setTheme(theme);
    refreshSessionToken().finally(() => {
      setInitializing(false);
    });
  }, [setInitializing, setTheme, theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="h-screen w-screen flex items-center justify-center bg-app-bg dark:bg-app-dark-bg text-xs text-app-muted">
              Loading view...
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <ChatDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <ToastViewport />
      </BrowserRouter>
    </QueryClientProvider>
  );
};
