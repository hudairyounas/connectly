import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquareText, ArrowLeft, CheckCircle2, AlertCircle, Terminal } from 'lucide-react';
import { forgotPasswordFormSchema, ForgotPasswordFormValues } from '../lib/validation/schemas';
import { api, ApiClientError, APP_NAME } from '../lib/api/client';

export const ForgotPasswordPage: React.FC = () => {
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setServerError(null);
    setDevResetToken(null);
    try {
      const res = await api.auth.forgotPassword(values.email);
      setSubmittedMessage(res.message);

      // In development mode when SMTP is not configured, check dev outbox
      try {
        const outbox = await api.auth.getDevOutbox(values.email);
        if (!outbox.smtpConfigured && outbox.resetPasswordToken) {
          setDevResetToken(outbox.resetPasswordToken);
        }
      } catch {
        // Ignore in production
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
      } else {
        setServerError('Request failed. Please try again.');
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
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="text-sm text-app-muted dark:text-app-dark-muted mt-1">
            Enter your account email address to request a password reset token
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

          {submittedMessage ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 text-xs leading-relaxed">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Password Recovery Processed</p>
                  <p className="mt-1">{submittedMessage}</p>
                </div>
              </div>

              {devResetToken && (
                <div className="p-4 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-app-accent">
                    <Terminal className="w-4 h-4" />
                    <span>Development Mode Outbox (SMTP Not Configured)</span>
                  </div>
                  <p className="text-app-muted dark:text-app-dark-muted">
                    Since no external SMTP server is configured in <code>.env</code>, use the
                    development link below to complete the password reset:
                  </p>
                  <Link
                    to={`/reset-password?token=${encodeURIComponent(devResetToken)}`}
                    className="inline-block font-semibold text-app-accent hover:underline break-all"
                  >
                    Open Reset Password Form with Token &rarr;
                  </Link>
                </div>
              )}

              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-xs font-semibold text-app-accent hover:underline"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to sign in</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
                  placeholder="you@example.com"
                  {...register('email')}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent"
                />
                {errors.email && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-app-accent hover:bg-app-accent-hover disabled:opacity-60 text-white font-semibold text-sm shadow-soft transition-colors"
              >
                {isSubmitting ? 'Submitting...' : 'Send Reset Instructions'}
              </button>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-app-muted hover:text-app-text dark:hover:text-app-dark-text"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to sign in</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
