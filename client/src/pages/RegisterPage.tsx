import React, { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquareText, Eye, EyeOff, AlertCircle } from 'lucide-react';
import {
  registerFormSchema,
  RegisterFormValues,
  calculatePasswordStrength,
} from '../lib/validation/schemas';
import { api, ApiClientError, APP_NAME } from '../lib/api/client';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setAuth = useAuthStore((s) => s.setAuth);
  const addToast = useUIStore((s) => s.addToast);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      displayName: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const passwordValue = watch('password');
  const strength = calculatePasswordStrength(passwordValue || '');

  if (isAuthenticated) {
    return <Navigate to="/chat" replace />;
  }

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      const res = await api.auth.register(values);
      setAuth(res.user, res.accessToken, res.sessionId);
      addToast({
        title: 'Account created!',
        description: `Welcome to ${APP_NAME}, ${res.user.displayName}.`,
        variant: 'success',
      });
      navigate('/chat', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'USERNAME_TAKEN') {
          setError('username', { message: err.message });
        } else if (err.code === 'EMAIL_TAKEN') {
          setError('email', { message: err.message });
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError('Registration failed. Please check your network and try again.');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-10 bg-app-bg dark:bg-app-dark-bg text-app-text dark:text-app-dark-text">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 rounded-xl bg-app-accent flex items-center justify-center text-white shadow-soft">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">{APP_NAME}</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="text-sm text-app-muted dark:text-app-dark-muted mt-1">
            Start real-time conversations with your contacts and teams
          </p>
        </div>

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
                htmlFor="displayName"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted dark:text-app-dark-muted mb-1.5"
              >
                Full Name
              </label>
              <input
                id="displayName"
                type="text"
                autoComplete="name"
                placeholder="Elena Rostova"
                {...register('displayName')}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent"
              />
              {errors.displayName && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.displayName.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted dark:text-app-dark-muted mb-1.5"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="elena_r"
                {...register('username')}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent"
              />
              {errors.username && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.username.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted dark:text-app-dark-muted mb-1.5"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="elena@example.com"
                {...register('email')}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent"
              />
              {errors.email && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted dark:text-app-dark-muted mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
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

              {passwordValue && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-app-muted dark:text-app-dark-muted">
                      Password strength
                    </span>
                    <span className="font-semibold">{strength.label}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 h-1.5">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <div
                        key={step}
                        className={`rounded-full transition-colors ${
                          step <= strength.score
                            ? strength.colorClass
                            : 'bg-slate-200 dark:bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {errors.password && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted dark:text-app-dark-muted mb-1.5"
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  {...register('confirmPassword')}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-app-muted hover:text-app-text dark:hover:text-app-dark-text"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-app-accent hover:bg-app-accent-hover disabled:opacity-60 text-white font-semibold text-sm shadow-soft transition-colors"
            >
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-xs text-app-muted dark:text-app-dark-muted mt-6">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-app-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
