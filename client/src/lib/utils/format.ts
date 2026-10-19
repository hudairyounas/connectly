import {
  format,
  isToday,
  isYesterday,
  isThisWeek,
  formatDistanceToNow,
  isSameDay,
} from 'date-fns';

export function formatConversationTime(isoDate?: string | null): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  if (isToday(date)) {
    return format(date, 'HH:mm');
  }
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  if (isThisWeek(date)) {
    return format(date, 'EEE');
  }
  return format(date, 'MMM d');
}

export function formatMessageTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'HH:mm');
}

export function formatDateSeparator(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

export function shouldShowDateSeparator(currIso: string, prevIso?: string): boolean {
  if (!prevIso) return true;
  const curr = new Date(currIso);
  const prev = new Date(prevIso);
  return !isSameDay(curr, prev);
}

export function formatLastSeen(isoDate?: string | null): string {
  if (!isoDate) return 'Offline';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Offline';
  return `Last seen ${formatDistanceToNow(date, { addSuffix: true })}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function getInitials(name: string): string {
  const parts = (name || 'User').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}
