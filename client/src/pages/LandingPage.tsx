import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  MessageSquareText,
  ShieldCheck,
  Zap,
  Users,
  ArrowRight,
  Lock,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { APP_NAME } from '../lib/api/client';

export const LandingPage: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/chat" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-app-bg dark:bg-app-dark-bg text-app-text dark:text-app-dark-text">
      {/* Top Header */}
      <header className="w-full border-b border-app-border dark:border-app-dark-border bg-app-surface/85 dark:bg-app-dark-surface/85 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-app-accent flex items-center justify-center text-white shadow-soft">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium rounded-xl text-app-text dark:text-app-dark-text hover:bg-app-incoming dark:hover:bg-app-dark-elevated transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-app-accent hover:bg-app-accent-hover text-white shadow-soft transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col justify-center max-w-6xl w-full mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-app-accent/10 text-app-accent text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Real-Time Team & Personal Messaging</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.15]">
              Calm, fast, and reliable conversations for everyday work.
            </h1>

            <p className="text-base sm:text-lg text-app-muted dark:text-app-dark-muted max-w-xl leading-relaxed">
              {APP_NAME} brings instant direct messaging, organized group spaces, verified delivery
              receipts, and secure file sharing into a distraction-free workspace.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white font-semibold text-sm shadow-soft transition-colors"
              >
                <span>Create your account</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-app-border dark:border-app-dark-border bg-app-surface dark:bg-app-dark-surface hover:bg-app-incoming dark:hover:bg-app-dark-elevated font-semibold text-sm transition-colors"
              >
                <span>Sign in to workspace</span>
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-app-border dark:border-app-dark-border">
              <div>
                <p className="text-sm font-semibold">Instant Sync</p>
                <p className="text-xs text-app-muted dark:text-app-dark-muted mt-0.5">
                  Socket.IO real-time delivery & receipts
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold">Role-Based Groups</p>
                <p className="text-xs text-app-muted dark:text-app-dark-muted mt-0.5">
                  Granular admin & member controls
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold">Privacy First</p>
                <p className="text-xs text-app-muted dark:text-app-dark-muted mt-0.5">
                  Session management & visibility controls
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Preview Card */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel overflow-hidden">
              <div className="px-4 py-3 border-b border-app-border dark:border-app-dark-border flex items-center justify-between bg-app-bg/50 dark:bg-app-dark-elevated/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-app-accent/15 text-app-accent flex items-center justify-center text-xs font-bold">
                    PD
                  </div>
                  <div>
                    <p className="text-xs font-semibold">Product Design Sync</p>
                    <p className="text-[11px] text-app-success font-medium">3 members online</p>
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-app-incoming dark:bg-app-dark-elevated text-app-muted">
                  Pinned
                </span>
              </div>

              <div className="p-4 space-y-3.5 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold shrink-0">
                    EL
                  </div>
                  <div className="bg-app-incoming dark:bg-app-dark-elevated rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[82%]">
                    <p className="font-semibold text-[11px] text-app-accent mb-0.5">Elena</p>
                    <p className="leading-relaxed">
                      We just finalized the new typography scale and dark mode contrast tokens.
                    </p>
                    <span className="block text-[10px] text-app-muted mt-1 text-right">10:42</span>
                  </div>
                </div>

                <div className="flex items-start justify-end">
                  <div className="bg-app-outgoing text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[82%] shadow-soft">
                    <p className="leading-relaxed">
                      Looks super crisp! Read receipts and file previews are live too.
                    </p>
                    <span className="block text-[10px] text-indigo-100 mt-1 text-right">
                      10:43 · Read
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 text-[11px] text-app-muted">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-app-accent animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-app-accent animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-app-accent animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span>Elena is typing...</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature strip */}
        <section className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              icon: Zap,
              title: 'Real-Time Socket.IO',
              desc: 'Instant message delivery, typing indicators, and multi-tab presence synchronization.',
            },
            {
              icon: ShieldCheck,
              title: 'Verified Security',
              desc: 'Argon/bcrypt password hashing, rotating sessions, and authorized room guards.',
            },
            {
              icon: Users,
              title: 'Direct & Group Chats',
              desc: 'Start 1-on-1 conversations or manage team groups with admin permissions.',
            },
            {
              icon: Lock,
              title: 'Granular Privacy',
              desc: 'Control online status visibility, last-seen timestamps, read receipts, and blocked users.',
            },
          ].map((feat) => (
            <div
              key={feat.title}
              className="p-5 rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-soft"
            >
              <div className="w-9 h-9 rounded-xl bg-app-accent/10 text-app-accent flex items-center justify-center mb-3">
                <feat.icon className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-semibold">{feat.title}</h2>
              <p className="text-xs text-app-muted dark:text-app-dark-muted mt-1.5 leading-relaxed">
                {feat.desc}
              </p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
};
