import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MessageSquareText, CheckCircle2, AlertCircle, Terminal } from 'lucide-react';
import { api, ApiClientError, APP_NAME } from '../lib/api/client';
import { useAuthStore } from '../stores/authStore';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [tokenInput, setTokenInput] = useState(searchParams.get('token') || '');
  const [devToken, setDevToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      void verifyToken(urlToken);
    } else if (user?.email && !user.emailVerified) {
      api.auth
        .getDevOutbox(user.email)
        .then((outbox) => {
          if (!outbox.smtpConfigured && outbox.verifyEmailToken) {
            setDevToken(outbox.verifyEmailToken);
          }
        })
        .catch(() => {});
    }
  }, [searchParams, user?.email, user?.emailVerified]);

  const verifyToken = async (rawToken: string) => {
    if (!rawToken.trim()) return;
    setStatus('loading');
    try {
      const res = await api.auth.verifyEmail(rawToken.trim());
      setStatus('success');
      setMessage(res.message);
      updateUser({ emailVerified: true });
    } catch (err) {
      setStatus('error');
      setMessage(
        err instanceof ApiClientError
          ? err.message
          : 'Verification failed. Token may be invalid or expired.',
      );
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
          <h1 className="text-2xl font-bold tracking-tight">Email Verification</h1>
          <p className="text-sm text-app-muted dark:text-app-dark-muted mt-1">
            Confirm your email address using your verification token
          </p>
        </div>

        <div className="rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel p-6 sm:p-8 space-y-5">
          {status === 'success' || user?.emailVerified ? (
            <div className="flex flex-col items-center text-center space-y-3 py-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base font-semibold">Email Verified</h2>
              <p className="text-xs text-app-muted dark:text-app-dark-muted">
                {message || 'Your email address has been verified.'}
              </p>
              <Link
                to="/chat"
                className="inline-flex px-5 py-2.5 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white text-xs font-semibold transition-colors"
              >
                Continue to {APP_NAME}
              </Link>
            </div>
          ) : (
            <>
              {status === 'error' && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{message}</span>
                </div>
              )}

              {devToken && (
                <div className="p-4 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-app-accent">
                    <Terminal className="w-4 h-4" />
                    <span>Development Mode Outbox (SMTP Not Configured)</span>
                  </div>
                  <p className="text-app-muted dark:text-app-dark-muted">
                    Click below to verify your email using the generated development token:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTokenInput(devToken);
                      void verifyToken(devToken);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-app-accent text-white font-semibold hover:bg-app-accent-hover transition-colors"
                  >
                    Verify Email Now
                  </button>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void verifyToken(tokenInput);
                }}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="verify-token"
                    className="block text-xs font-semibold uppercase tracking-wider text-app-muted dark:text-app-dark-muted mb-1.5"
                  >
                    Verification Token
                  </label>
                  <input
                    id="verify-token"
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste verification token"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-app-border dark:border-app-dark-border bg-app-bg/50 dark:bg-app-dark-bg/60 focus:outline-none focus:ring-2 focus:ring-app-accent font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={status === 'loading' || !tokenInput.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-app-accent hover:bg-app-accent-hover disabled:opacity-60 text-white font-semibold text-sm shadow-soft transition-colors"
                >
                  {status === 'loading' ? 'Verifying...' : 'Verify Email'}
                </button>
              </form>

              <div className="text-center">
                <Link to="/chat" className="text-xs font-semibold text-app-accent hover:underline">
                  Back to workspace
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
