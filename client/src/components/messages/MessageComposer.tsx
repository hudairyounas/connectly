import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Smile,
  X,
  Reply,
  Pencil,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Message, Attachment } from '../../types';
import { uploadAttachmentWithProgress, ApiClientError } from '../../lib/api/client';
import { socketService } from '../../lib/socket/socketService';
import { useAuthStore } from '../../stores/authStore';
import { formatFileSize } from '../../lib/utils/format';

const COMPOSER_EMOJIS = [
  '😀', '😂', '🥹', '😊', '😍', '🤔', '😎', '🙌',
  '👍', '👏', '🔥', '🎉', '❤️', '✨', '🚀', '💯',
];

interface MessageComposerProps {
  conversationId: string;
  replyingTo: Message | null;
  editingMessage: Message | null;
  disabled?: boolean;
  disabledReason?: string;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSendMessage: (payload: {
    content: string;
    replyTo: Message | null;
    attachments: Attachment[];
  }) => Promise<void>;
  onSaveEdit: (messageId: string, newContent: string) => Promise<void>;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  conversationId,
  replyingTo,
  editingMessage,
  disabled = false,
  disabledReason,
  onCancelReply,
  onCancelEdit,
  onSendMessage,
  onSaveEdit,
}) => {
  const user = useAuthStore((s) => s.user);
  const enterToSend = user?.appearanceSettings?.enterToSend !== false;

  const [text, setText] = useState('');
  const [stagedAttachments, setStagedAttachments] = useState<Attachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const lastTypingEmitRef = useRef<number>(0);
  const stopTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync text when entering/leaving edit mode
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  // Reset transient state when switching conversations
  useEffect(() => {
    setComposerError(null);
    setShowEmojis(false);
    setStagedAttachments([]);
    setUploadProgress(null);
  }, [conversationId]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    setComposerError(null);

    const now = Date.now();
    if (val.trim().length > 0 && now - lastTypingEmitRef.current > 1800) {
      lastTypingEmitRef.current = now;
      socketService.emitTypingStart(conversationId);
    }

    if (stopTypingTimerRef.current) {
      clearTimeout(stopTypingTimerRef.current);
    }
    stopTypingTimerRef.current = setTimeout(() => {
      socketService.emitTypingStop(conversationId);
    }, 2500);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setComposerError(null);

    const abortController = new AbortController();
    uploadAbortRef.current = abortController;
    setUploadProgress(5);

    try {
      const res = await uploadAttachmentWithProgress({
        file,
        conversationId,
        onProgress: (pct) => setUploadProgress(pct),
        signal: abortController.signal,
      });
      setStagedAttachments((prev) => [...prev, res.attachment]);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'UPLOAD_CANCELLED') {
        // User cancelled upload
      } else {
        setComposerError(err instanceof Error ? err.message : 'File upload failed');
      }
    } finally {
      setUploadProgress(null);
      uploadAbortRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    uploadAbortRef.current?.abort();
    setUploadProgress(null);
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (isSending || uploadProgress !== null) return;

    if (editingMessage) {
      if (!trimmed) {
        setComposerError('Edited message cannot be empty.');
        return;
      }
      setIsSending(true);
      try {
        await onSaveEdit(editingMessage._id, trimmed);
        setText('');
        onCancelEdit();
      } catch (err) {
        setComposerError(err instanceof Error ? err.message : 'Could not update message');
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (!trimmed && stagedAttachments.length === 0) {
      return;
    }

    if (trimmed.length > 4000) {
      setComposerError('Message cannot exceed 4,000 characters.');
      return;
    }

    const pendingText = trimmed;
    const pendingAttachments = [...stagedAttachments];
    const pendingReply = replyingTo;

    setText('');
    setStagedAttachments([]);
    onCancelReply();
    socketService.emitTypingStop(conversationId);

    setIsSending(true);
    try {
      await onSendMessage({
        content: pendingText,
        replyTo: pendingReply,
        attachments: pendingAttachments,
      });
    } catch (err) {
      // Preserve unsent text on recoverable error if not handled optimistically
      setComposerError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (showEmojis) {
        setShowEmojis(false);
      } else if (editingMessage) {
        onCancelEdit();
        setText('');
      } else if (replyingTo) {
        onCancelReply();
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && enterToSend) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  if (disabled) {
    return (
      <div className="p-4 border-t border-app-border dark:border-app-dark-border bg-app-surface dark:bg-app-dark-surface text-center text-xs text-app-muted">
        {disabledReason || 'You cannot send messages in this conversation.'}
      </div>
    );
  }

  return (
    <div className="border-t border-app-border dark:border-app-dark-border bg-app-surface dark:bg-app-dark-surface px-3 sm:px-5 py-3 space-y-2">
      {/* Error Banner */}
      {composerError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{composerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setComposerError(null)}
            aria-label="Dismiss error"
            className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Reply Banner */}
      {replyingTo && !editingMessage && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-app-incoming/80 dark:bg-app-dark-elevated border-l-4 border-app-accent text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="w-3.5 h-3.5 text-app-accent shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-app-accent">
                Replying to {replyingTo.sender.displayName}
              </p>
              <p className="truncate text-app-muted dark:text-app-dark-muted">
                {replyingTo.content || 'Attachment'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="p-1 rounded-lg text-app-muted hover:text-app-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit Mode Banner */}
      {editingMessage && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50/80 dark:bg-amber-950/50 border-l-4 border-amber-500 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Pencil className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-amber-700 dark:text-amber-300">Editing message</p>
              <p className="truncate text-app-muted">{editingMessage.content}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onCancelEdit();
              setText('');
            }}
            aria-label="Cancel edit"
            className="p-1 rounded-lg text-app-muted hover:text-app-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Progress Indicator */}
      {uploadProgress !== null && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border text-xs">
          <div className="flex-1 space-y-1">
            <div className="flex justify-between">
              <span className="font-medium">Uploading attachment...</span>
              <span className="font-semibold text-app-accent">{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-app-accent transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancelUpload}
            className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 font-semibold hover:bg-red-100"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Staged Attachments Preview */}
      {stagedAttachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {stagedAttachments.map((att) => (
            <div
              key={att._id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border text-xs"
            >
              <FileText className="w-3.5 h-3.5 text-app-accent shrink-0" />
              <span className="font-medium truncate max-w-[160px]">{att.originalName}</span>
              <span className="text-[10px] text-app-muted">({formatFileSize(att.size)})</span>
              <button
                type="button"
                onClick={() =>
                  setStagedAttachments((prev) => prev.filter((item) => item._id !== att._id))
                }
                aria-label={`Remove ${att.originalName}`}
                className="p-0.5 rounded hover:bg-app-incoming text-app-muted"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer Input Bar */}
      <div className="relative flex items-end gap-2">
        {/* Emoji Picker Popover */}
        {showEmojis && (
          <div className="absolute bottom-full left-0 mb-2 z-30 p-2.5 rounded-2xl bg-app-surface dark:bg-app-dark-surface border border-app-border dark:border-app-dark-border shadow-panel grid grid-cols-8 gap-1">
            {COMPOSER_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setText((prev) => `${prev}${emoji}`);
                  setShowEmojis(false);
                  textareaRef.current?.focus();
                }}
                className="w-8 h-8 rounded-lg hover:bg-app-incoming dark:hover:bg-app-dark-elevated flex items-center justify-center text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Attachment Upload Button */}
        {!editingMessage && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach image or document"
              aria-label="Attach file"
              className="p-2.5 rounded-xl text-app-muted hover:text-app-text dark:hover:text-app-dark-text hover:bg-app-incoming dark:hover:bg-app-dark-elevated transition-colors shrink-0"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.md,.csv,.json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        )}

        {/* Emoji Button */}
        <button
          type="button"
          onClick={() => setShowEmojis((prev) => !prev)}
          title="Insert emoji"
          aria-label="Insert emoji"
          className="p-2.5 rounded-xl text-app-muted hover:text-app-text dark:hover:text-app-dark-text hover:bg-app-incoming dark:hover:bg-app-dark-elevated transition-colors shrink-0"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={editingMessage ? 'Edit your message...' : 'Write a message...'}
          aria-label="Message input"
          className="flex-1 max-h-32 min-h-[42px] py-2.5 px-3.5 text-sm rounded-xl bg-app-bg dark:bg-app-dark-bg border border-app-border dark:border-app-dark-border focus:outline-none focus:ring-2 focus:ring-app-accent resize-none leading-relaxed"
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={
            isSending ||
            uploadProgress !== null ||
            (!text.trim() && stagedAttachments.length === 0)
          }
          aria-label={editingMessage ? 'Save edited message' : 'Send message'}
          className="p-2.5 rounded-xl bg-app-accent hover:bg-app-accent-hover disabled:opacity-45 text-white shadow-soft transition-colors shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
