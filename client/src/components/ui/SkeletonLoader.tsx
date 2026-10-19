import React from 'react';

export const ConversationSkeletonList: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="divide-y divide-app-border/60 dark:divide-app-dark-border/60" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
          <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex justify-between items-center gap-2">
              <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-2.5 w-10 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
            <div className="h-3 w-44 bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const MessageSkeletonList: React.FC = () => {
  return (
    <div className="flex-1 p-6 space-y-5 overflow-hidden" aria-busy="true">
      <div className="flex items-end gap-2.5 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="h-14 w-60 rounded-2xl rounded-bl-sm bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="flex items-end justify-end gap-2.5 animate-pulse">
        <div className="h-12 w-52 rounded-2xl rounded-br-sm bg-indigo-200/60 dark:bg-indigo-950/60" />
      </div>
      <div className="flex items-end gap-2.5 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="h-16 w-72 rounded-2xl rounded-bl-sm bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="flex items-end justify-end gap-2.5 animate-pulse">
        <div className="h-10 w-44 rounded-2xl rounded-br-sm bg-indigo-200/60 dark:bg-indigo-950/60" />
      </div>
    </div>
  );
};
