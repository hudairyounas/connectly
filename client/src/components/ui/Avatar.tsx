import React, { useState } from 'react';
import { getInitials } from '../../lib/utils/format';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  availability?: 'online' | 'away' | 'busy' | 'offline';
  showPresence?: boolean;
  isGroup?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

const DOT_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-2 h-2 right-0 bottom-0',
  sm: 'w-2.5 h-2.5 right-0 bottom-0',
  md: 'w-3 h-3 right-0 bottom-0',
  lg: 'w-3.5 h-3.5 right-0.5 bottom-0.5',
  xl: 'w-4 h-4 right-1 bottom-1',
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  size = 'md',
  isOnline = false,
  availability = 'online',
  showPresence = false,
  isGroup = false,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  const dotColor = !isOnline
    ? 'bg-slate-400 dark:bg-slate-600'
    : availability === 'away'
      ? 'bg-amber-500'
      : availability === 'busy'
        ? 'bg-rose-500'
        : 'bg-app-success';

  const statusLabel = !isOnline
    ? 'Offline'
    : availability === 'away'
      ? 'Away'
      : availability === 'busy'
        ? 'Busy'
        : 'Online';

  return (
    <div className={`relative inline-flex shrink-0 select-none ${className}`}>
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          onError={() => setImgError(true)}
          className={`${SIZE_CLASSES[size]} rounded-full object-cover border border-app-border dark:border-app-dark-border bg-app-incoming dark:bg-app-dark-elevated`}
        />
      ) : (
        <div
          aria-label={name}
          className={`${SIZE_CLASSES[size]} rounded-full flex items-center justify-center font-semibold tracking-tight ${
            isGroup
              ? 'bg-indigo-100 text-app-accent dark:bg-indigo-950/70 dark:text-indigo-300'
              : 'bg-app-accent/15 text-app-accent dark:bg-app-accent/25 dark:text-indigo-200'
          } border border-app-border/70 dark:border-app-dark-border`}
        >
          {getInitials(name)}
        </div>
      )}

      {showPresence && !isGroup && (
        <span
          title={statusLabel}
          aria-label={`Status: ${statusLabel}`}
          className={`absolute ${DOT_CLASSES[size]} rounded-full ring-2 ring-app-surface dark:ring-app-dark-surface ${dotColor}`}
        />
      )}
    </div>
  );
};
