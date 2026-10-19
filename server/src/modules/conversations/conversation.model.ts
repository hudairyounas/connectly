import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversationParticipant {
  userId: Types.ObjectId;
  role: 'admin' | 'member';
  joinedAt: Date;
  lastReadMessageId: Types.ObjectId | null;
  lastReadAt: Date | null;
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
}

export interface ILastMessagePreview {
  messageId: Types.ObjectId;
  contentPreview: string;
  senderId: Types.ObjectId;
  type: 'text' | 'attachment' | 'system';
  createdAt: Date;
}

export interface IConversation extends Document {
  _id: Types.ObjectId;
  type: 'direct' | 'group';
  directPairKey?: string;
  groupName: string | null;
  groupDescription: string;
  groupAvatar: string | null;
  createdBy: Types.ObjectId;
  participants: IConversationParticipant[];
  lastMessage: ILastMessagePreview | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ParticipantSchema = new Schema<IConversationParticipant>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    lastReadMessageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    lastReadAt: {
      type: Date,
      default: null,
    },
    unreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isMuted: {
      type: Boolean,
      default: false,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const LastMessageSchema = new Schema<ILastMessagePreview>(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
    },
    contentPreview: {
      type: String,
      default: '',
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'attachment', 'system'],
      default: 'text',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const ConversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ['direct', 'group'],
      required: true,
    },
    directPairKey: {
      type: String,
      sparse: true,
      unique: true,
    },
    groupName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    groupDescription: {
      type: String,
      default: '',
      maxlength: 400,
    },
    groupAvatar: {
      type: String,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participants: {
      type: [ParticipantSchema],
      required: true,
    },
    lastMessage: {
      type: LastMessageSchema,
      default: null,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

ConversationSchema.index({ 'participants.userId': 1, lastActivityAt: -1 });

export function buildDirectPairKey(userA: string, userB: string): string {
  return [String(userA), String(userB)].sort().join(':');
}

export const ConversationModel = mongoose.model<IConversation>('Conversation', ConversationSchema);
