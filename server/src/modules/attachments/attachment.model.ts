import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAttachment extends Document {
  _id: Types.ObjectId;
  uploaderId: Types.ObjectId;
  conversationId: Types.ObjectId;
  originalName: string;
  storageName: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'document';
  createdAt: Date;
}

const AttachmentSchema = new Schema<IAttachment>(
  {
    uploaderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    storageName: {
      type: String,
      required: true,
      unique: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    kind: {
      type: String,
      enum: ['image', 'document'],
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

AttachmentSchema.index({ conversationId: 1, _id: -1 });

export const AttachmentModel = mongoose.model<IAttachment>('Attachment', AttachmentSchema);
