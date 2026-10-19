import React, { useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  RotateCcw,
  Reply,
  SmilePlus,
  Pencil,
  Trash2,
  FileText,
  Download,
} from 'lucide-react';
import { Message, Attachment } from '../../types';
import { Avatar } from '../ui/Avatar';
import { formatMessageTimestamp, formatFileSize } from '../../lib/utils/format';
import { useAuthStore } from '../../stores/authStore';

const REACTION_SET = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '🙏'];

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isGroup: boolean;
  canDeleteForEveryone: boolean;
  highlighted?: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message, mode: 'self' | 'everyone') => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onRetrySend?: (message: Message) => void;
  onJumpToMessage?: (messageId: string) => void;
  onPreviewImage?: (attachment: Attachment) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  isGroup,
  canDeleteForEveryone,
  highlighted = false,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
  onRetrySend,
  onJumpToMessage,
  onPreviewImage,
}) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentUserId = useAuthStore((s) => s.user?._id);

  const [showPicker, setShowPicker] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);

  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-2.5">
        <span className="px-3 py-1 rounded-full bg-app-incoming/80 dark:bg-app-dark-elevated/80 text-[11px] font-medium text-app-muted dark:text-app-dark-muted">
          {message.content}
        </span>
      </div>
    );
  }

  const withAuthQuery = (url: string) => {
    if (!accessToken) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(accessToken)}`;
  };

  return (
    <div
      id={`msg-${message._id}`}
      className={`group relative flex items-end gap-2.5 py-1 px-2 rounded-xl transition-colors ${
        isOwn ? 'justify-end' : 'justify-start'
      } ${highlighted ? 'bg-app-accent/15 ring-1 ring-app-accent' : ''}`}
    >
      {!isOwn && (
        <Avatar
          name={message.sender.displayName}
          src={message.sender.avatar}
          size="xs"
          className="mb-1"
        />
      )}

      <div className={`flex flex-col max-w-[82%] sm:max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender Name in Groups */}
        {isGroup && !isOwn && (
          <span className="text-[11px] font-semibold text-app-accent ml-1 mb-0.5">
            {message.sender.displayName}
          </span>
        )}

        <div className="relative flex items-center gap-1.5">
          {/* Hover Action Toolbar (Left side for own messages) */}
          {isOwn && !message.isDeletedForEveryone && message.status !== 'sending' && (
            <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border rounded-xl px-1.5 py-1 shadow-soft">
              <button
                type="button"
                onClick={() => setShowPicker((p) => !p)}
                title="React"
                aria-label="Add reaction"
                className="p-1 rounded-lg text-app-muted hover:text-app-text dark:hover:text-app-dark-text hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
              >
                <SmilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onReply(message)}
                title="Reply"
                aria-label="Reply to message"
                className="p-1 rounded-lg text-app-muted hover:text-app-text dark:hover:text-app-dark-text hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
              >
                <Reply className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onEdit(message)}
                title="Edit message"
                aria-label="Edit message"
                className="p-1 rounded-lg text-app-muted hover:text-app-text dark:hover:text-app-dark-text hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteMenu((p) => !p)}
                title="Delete message"
                aria-label="Delete message"
                className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Message Bubble Container */}
          <div
            className={`relative rounded-2xl px-3.5 py-2.5 text-sm shadow-soft ${
              message.isDeletedForEveryone
                ? 'bg-app-incoming/60 dark:bg-app-dark-elevated/50 text-app-muted italic border border-dashed border-app-border dark:border-app-dark-border'
                : isOwn
                  ? 'bg-app-outgoing text-white rounded-br-sm'
                  : 'bg-app-incoming dark:bg-app-dark-elevated text-app-text dark:text-app-dark-text rounded-bl-sm'
            }`}
          >
            {/* Reply Preview inside Bubble */}
            {message.replyTo && !message.isDeletedForEveryone && (
              <button
                type="button"
                onClick={() => onJumpToMessage && onJumpToMessage(message.replyTo!._id)}
                className={`w-full text-left mb-2 pl-2.5 pr-2 py-1.5 rounded-lg border-l-2 text-xs transition-colors ${
                  isOwn
                    ? 'bg-white/15 border-white/80 text-white hover:bg-white/20'
                    : 'bg-black/5 dark:bg-white/5 border-app-accent text-app-text dark:text-app-dark-text hover:bg-black/10'
                }`}
              >
                <p className="font-semibold text-[11px] truncate">
                  {message.replyTo.sender.displayName}
                </p>
                <p className="truncate opacity-85 text-[11px]">{message.replyTo.content}</p>
              </button>
            )}

            {/* Attachments */}
            {!message.isDeletedForEveryone &&
              message.attachments &&
              message.attachments.length > 0 && (
                <div className="space-y-2 mb-2">
                  {message.attachments.map((att) =>
                    att.kind === 'image' ? (
                      <div key={att._id} className="rounded-xl overflow-hidden max-w-xs">
                        <img
                          src={withAuthQuery(att.url)}
                          alt={att.originalName}
                          onClick={() => onPreviewImage && onPreviewImage(att)}
                          className="max-h-60 w-auto object-cover rounded-xl cursor-zoom-in hover:opacity-95 transition-opacity"
                        />
                      </div>
                    ) : (
                      <a
                        key={att._id}
                        href={withAuthQuery(`${att.url}?download=1`)}
                        download={att.originalName}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border text-xs ${
                          isOwn
                            ? 'bg-white/15 border-white/25 text-white hover:bg-white/20'
                            : 'bg-app-surface dark:bg-app-dark-surface border-app-border dark:border-app-dark-border hover:bg-app-bg'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{att.originalName}</p>
                            <p className="text-[10px] opacity-75">{formatFileSize(att.size)}</p>
                          </div>
                        </div>
                        <Download className="w-4 h-4 shrink-0" />
                      </a>
                    ),
                  )}
                </div>
              )}

            {/* Message Text Content */}
            {message.content && (
              <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
            )}

            {/* Timestamp, Edited Flag & Delivery Status */}
            <div
              className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] select-none ${
                message.isDeletedForEveryone
                  ? 'text-app-muted'
                  : isOwn
                    ? 'text-indigo-100'
                    : 'text-app-muted dark:text-app-dark-muted'
              }`}
            >
              {message.editedAt && !message.isDeletedForEveryone && (
                <span title={`Edited ${new Date(message.editedAt).toLocaleString()}`}>
                  (edited)
                </span>
              )}
              <span>{formatMessageTimestamp(message.createdAt)}</span>

              {isOwn && !message.isDeletedForEveryone && (
                <span className="inline-flex items-center gap-0.5 ml-0.5">
                  {message.status === 'sending' && (
                    <span className="inline-flex items-center gap-0.5" title="Sending">
                      <Clock className="w-3 h-3" />
                      <span className="sr-only">Sending</span>
                    </span>
                  )}
                  {message.status === 'sent' && (
                    <span className="inline-flex items-center gap-0.5" title="Sent">
                      <Check className="w-3 h-3" />
                      <span>Sent</span>
                    </span>
                  )}
                  {message.status === 'delivered' && (
                    <span className="inline-flex items-center gap-0.5" title="Delivered">
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Delivered</span>
                    </span>
                  )}
                  {message.status === 'read' && (
                    <span
                      className="inline-flex items-center gap-0.5 font-semibold text-white"
                      title="Read"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Read</span>
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Hover Action Toolbar (Right side for incoming messages) */}
          {!isOwn && !message.isDeletedForEveryone && (
            <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border rounded-xl px-1.5 py-1 shadow-soft">
              <button
                type="button"
                onClick={() => setShowPicker((p) => !p)}
                title="React"
                aria-label="Add reaction"
                className="p-1 rounded-lg text-app-muted hover:text-app-text dark:hover:text-app-dark-text hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
              >
                <SmilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onReply(message)}
                title="Reply"
                aria-label="Reply to message"
                className="p-1 rounded-lg text-app-muted hover:text-app-text dark:hover:text-app-dark-text hover:bg-app-incoming dark:hover:bg-app-dark-elevated"
              >
                <Reply className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteMenu((p) => !p)}
                title="Delete message"
                aria-label="Delete message"
                className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Quick Emoji Reaction Popover */}
          {showPicker && (
            <div
              className={`absolute bottom-full mb-1.5 z-30 flex items-center gap-1 p-1.5 rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel ${
                isOwn ? 'right-0' : 'left-0'
              }`}
            >
              {REACTION_SET.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onToggleReaction(message._id, emoji);
                    setShowPicker(false);
                  }}
                  className="w-7 h-7 rounded-lg hover:bg-app-incoming dark:hover:bg-app-dark-elevated flex items-center justify-center text-base transition-transform hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Delete Options Popover (Delete for me vs Delete for everyone) */}
          {showDeleteMenu && (
            <div
              className={`absolute bottom-full mb-1.5 z-30 w-44 rounded-xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel p-1.5 text-xs ${
                isOwn ? 'right-0' : 'left-0'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  onDelete(message, 'self');
                  setShowDeleteMenu(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-app-incoming dark:hover:bg-app-dark-elevated font-medium"
              >
                Delete for me
              </button>
              {canDeleteForEveryone && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(message, 'everyone');
                    setShowDeleteMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 font-semibold"
                >
                  Delete for everyone
                </button>
              )}
            </div>
          )}
        </div>

        {/* Failed Message Retry Action */}
        {message.status === 'failed' && (
          <div className="flex items-center gap-2 mt-1 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{message.errorMessage || 'Failed to send'}</span>
            {onRetrySend && (
              <button
                type="button"
                onClick={() => onRetrySend(message)}
                className="inline-flex items-center gap-1 font-semibold underline hover:no-underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {/* Reaction Pills */}
        {!message.isDeletedForEveryone && message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {message.reactions.map((r) => {
              const iReacted = currentUserId ? r.userIds.includes(currentUserId) : false;
              return (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onToggleReaction(message._id, r.emoji)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    iReacted
                      ? 'bg-app-accent/15 border-app-accent text-app-accent font-semibold'
                      : 'bg-app-surface dark:bg-app-dark-surface border-app-border dark:border-app-dark-border text-app-muted hover:bg-app-incoming'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="text-[11px]">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
