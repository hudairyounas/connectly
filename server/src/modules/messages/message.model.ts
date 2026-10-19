import mongoose, { Schema, Document, Types } from 'mongoose';

export const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '🙏'] as const;

export interface IMessageReaction {
  emoji: string;
  userIds: Types.ObjectId[];
}

export interface IMessage extends Document {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  clientMessageId?: string;
  type: 'text' | 'attachment' | 'system';
  content: string;
  attachments: Types.ObjectId[];
  replyTo: Types.ObjectId | null;
  reactions: IMessageReaction[];
  deliveredTo: Types.ObjectId[];
  readBy: Types.ObjectId[];
  deletedFor: Types.ObjectId[];
  isDeletedForEveryone: boolean;
  deletedAt: Date | null;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReactionSchema = new Schema<IMessageReaction>(
  {
    emoji: {
      type: String,
      required: true,
    },
    userIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { _id: false },
);

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    clientMessageId: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['text', 'attachment', 'system'],
      default: 'text',
    },
    content: {
      type: String,
      default: '',
      maxlength: 4000,
    },
    attachments: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Attachment',
      },
    ],
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    reactions: {
      type: [ReactionSchema],
      default: [],
    },
    deliveredTo: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    deletedFor: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isDeletedForEveryone: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    editedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

MessageSchema.index({ conversationId: 1, _id: -1 });
MessageSchema.index(
  { conversationId: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: 'string' } },
  },
);
MessageSchema.index({ conversationId: 1, content: 'text' });

export const MessageModel = mongoose.model<IMessage>('Message', MessageSchema);
