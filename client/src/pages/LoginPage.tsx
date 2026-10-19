import React, { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquareText, Eye, EyeOff, AlertCircle, Clock } from 'lucide-react';
import { loginFormSchema, LoginFormValues } from '../lib/validation/schemas';
import { api, ApiClientError, APP_NAME } from '../lib/api/client';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const setAuth = useAuthStore((s) => s.setAuth);
  const addToast = useUIStore((s) => s.addToast);

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      identifier: '',
      password: '',
    },
  });

  if (isAuthenticated) {
    return <Navigate to="/chat" replace />;
  }

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      const res = await api.auth.login(values);
      setAuth(res.user, res.accessToken, res.sessionId);
      addToast({
        title: `Welcome back, ${res.user.displayName}!`,
        variant: 'success',
      });
      navigate('/chat', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
      } else {
        setServerError('Unable to sign in right now. Please check your connection.');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-app-bg dark:bg-app-dark-bg text-app-text dark:text-app-dark-text">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 rounded-xl bg-app-accent flex items-center justify-center text-white shadow-soft">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">{APP_NAME}</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Sign in to your account</h1>
          <p className="text-sm text-app-muted dark:text-app-dark-muted mt-1">
            Enter your username or email address to continue
          </p>
        </div>

        {sessionExpired && (
          <div
            role="status"
            className="mb-4 flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-medium"
          >
            <Clock className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Your session expired or was revoked. Please sign in again.</span>
          </div>
        )}

        <div className="rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel p-6 sm:p-8">
          {serverError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="identifier"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted dark:text-app-dark-muted mb-1.5"
              >
                Email or Username
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                placeholder="you@example.com or username"
                {...register('identifier')}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent"
              />
              {errors.identifier && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.identifier.message}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-app-muted dark:text-app-dark-muted"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-app-accent hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password')}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-app-muted hover:text-app-text dark:hover:text-app-dark-text"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-app-accent hover:bg-app-accent-hover disabled:opacity-60 text-white font-semibold text-sm shadow-soft transition-colors"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-app-muted dark:text-app-dark-muted mt-6">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-semibold text-app-accent hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
