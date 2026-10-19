import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquareText, Eye, EyeOff, AlertCircle } from 'lucide-react';
import {
  resetPasswordFormSchema,
  ResetPasswordFormValues,
  calculatePasswordStrength,
} from '../lib/validation/schemas';
import { api, ApiClientError, APP_NAME } from '../lib/api/client';
import { useUIStore } from '../stores/uiStore';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      token: searchParams.get('token') || '',
      password: '',
      confirmPassword: '',
    },
  });

  const passwordValue = watch('password');
  const strength = calculatePasswordStrength(passwordValue || '');

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setServerError(null);
    try {
      const res = await api.auth.resetPassword(values);
      addToast({
        title: 'Password updated',
        description: res.message,
        variant: 'success',
      });
      navigate('/login', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
      } else {
        setServerError('Failed to reset password. Please try again.');
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
          <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
          <p className="text-sm text-app-muted dark:text-app-dark-muted mt-1">
            Enter your reset token and set a strong new password
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
                htmlFor="token"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted dark:text-app-dark-muted mb-1.5"
              >
                Reset Token
              </label>
              <input
                id="token"
                type="text"
                placeholder="Paste your password reset token"
                {...register('token')}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent font-mono"
              />
              {errors.token && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.token.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-app-muted dark:text-app-dark-muted mb-1.5"
              >
                New Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  {...register('password')}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-app-muted"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {passwordValue && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-app-muted">Strength</span>
                    <span className="font-semibold">{strength.label}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 h-1.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <div
                        key={s}
                        className={`rounded-full ${
                          s <= strength.score ? strength.colorClass : 'bg-slate-200 dark:bg-slate-800'
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
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your new password"
                {...register('confirmPassword')}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent"
              />
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
              {isSubmitting ? 'Updating password...' : 'Reset Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
