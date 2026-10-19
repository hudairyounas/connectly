import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { AttachmentModel } from './attachment.model.js';
import { ConversationModel } from '../conversations/conversation.model.js';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';

export const STORAGE_ROOT = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);
export const CHAT_FILES_DIR = path.join(STORAGE_ROOT, 'chat_files');
export const AVATARS_DIR = path.join(STORAGE_ROOT, 'avatars');

export async function ensureStorageDirectories(): Promise<void> {
  await fs.mkdir(CHAT_FILES_DIR, { recursive: true });
  await fs.mkdir(AVATARS_DIR, { recursive: true });
}

interface DetectedType {
  mimeType: string;
  extension: string;
  kind: 'image' | 'document';
}

export function verifyFileMagicBytes(buffer: Buffer, originalName: string): DetectedType {
  if (!buffer || buffer.length < 4) {
    throw new AppError('Uploaded file is empty or corrupted', 400, 'INVALID_FILE_CONTENT');
  }

  // Reject Windows PE (MZ) or Linux ELF executables immediately
  if (
    (buffer[0] === 0x4d && buffer[1] === 0x5a) ||
    (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46)
  ) {
    throw new AppError('Executable files are not permitted', 400, 'UNSUPPORTED_FILE_TYPE');
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mimeType: 'image/png', extension: '.png', kind: 'image' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: '.jpg', kind: 'image' };
  }

  // GIF: 47 49 46 38
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return { mimeType: 'image/gif', extension: '.gif', kind: 'image' };
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: '.webp', kind: 'image' };
  }

  // PDF: %PDF (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { mimeType: 'application/pdf', extension: '.pdf', kind: 'document' };
  }

  // Plain text (.txt, .md, .csv, .json) - check that there are no null bytes and extension is safe
  const ext = path.extname(originalName).toLowerCase();
  if (['.txt', '.md', '.csv', '.json'].includes(ext)) {
    const sample = buffer.subarray(0, Math.min(buffer.length, 512));
    const hasNullByte = sample.includes(0x00);
    if (!hasNullByte) {
      return {
        mimeType: 'text/plain',
        extension: ext,
        kind: 'document',
      };
    }
  }

  throw new AppError(
    'Unsupported or unsafe file format. Allowed formats: PNG, JPEG, WebP, GIF, PDF, TXT, MD, CSV, JSON.',
    400,
    'UNSUPPORTED_FILE_TYPE',
  );
}

export async function saveChatAttachment(params: {
  uploaderId: string;
  conversationId: string;
  originalName: string;
  buffer: Buffer;
}) {
  await ensureStorageDirectories();

  const conversation = await ConversationModel.findOne({
    _id: params.conversationId,
    'participants.userId': new Types.ObjectId(params.uploaderId),
  }).lean();

  if (!conversation) {
    throw new ForbiddenError('You are not a participant of this conversation');
  }

  const detected = verifyFileMagicBytes(params.buffer, params.originalName);
  const storageName = `${crypto.randomUUID()}${detected.extension}`;
  const fullPath = path.join(CHAT_FILES_DIR, storageName);

  await fs.writeFile(fullPath, params.buffer);

  const sanitizedName = path
    .basename(params.originalName)
    .replace(/[^\w.\- ()]/g, '_')
    .slice(0, 200);

  const attachment = await AttachmentModel.create({
    uploaderId: new Types.ObjectId(params.uploaderId),
    conversationId: new Types.ObjectId(params.conversationId),
    originalName: sanitizedName || `file${detected.extension}`,
    storageName,
    mimeType: detected.mimeType,
    size: params.buffer.length,
    kind: detected.kind,
  });

  return formatAttachment(attachment);
}

export async function saveAvatarImage(buffer: Buffer, originalName: string): Promise<string> {
  await ensureStorageDirectories();
  const detected = verifyFileMagicBytes(buffer, originalName);
  if (detected.kind !== 'image') {
    throw new AppError('Avatar must be a valid PNG, JPEG, WebP, or GIF image', 400, 'INVALID_AVATAR');
  }

  const storageName = `${crypto.randomUUID()}${detected.extension}`;
  const fullPath = path.join(AVATARS_DIR, storageName);
  await fs.writeFile(fullPath, buffer);

  return `/api/v1/attachments/avatars/${storageName}`;
}

export async function getAuthorizedAttachmentFile(userId: string, attachmentId: string) {
  const attachment = await AttachmentModel.findById(attachmentId).lean();
  if (!attachment) {
    throw new NotFoundError('Attachment not found');
  }

  const isMember = await ConversationModel.exists({
    _id: attachment.conversationId,
    'participants.userId': new Types.ObjectId(userId),
  });

  if (!isMember) {
    throw new ForbiddenError('You do not have access to this attachment');
  }

  const filePath = path.join(CHAT_FILES_DIR, path.basename(attachment.storageName));
  if (!fsSync.existsSync(filePath)) {
    throw new NotFoundError('Attachment file not found on storage');
  }

  return {
    attachment,
    filePath,
  };
}

export function formatAttachment(att: {
  _id: Types.ObjectId | string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'document';
  createdAt?: Date;
}) {
  return {
    _id: String(att._id),
    originalName: att.originalName,
    mimeType: att.mimeType,
    size: att.size,
    kind: att.kind,
    url: `/api/v1/attachments/${String(att._id)}/file`,
    createdAt: att.createdAt,
  };
}
