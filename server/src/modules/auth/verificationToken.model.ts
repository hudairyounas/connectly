import mongoose, { Schema, Document, Types } from 'mongoose';

export type TokenPurpose = 'verify_email' | 'reset_password';

export interface IVerificationToken extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  purpose: TokenPurpose;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

const VerificationTokenSchema = new Schema<IVerificationToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['verify_email', 'reset_password'],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

VerificationTokenSchema.index({ tokenHash: 1, purpose: 1 });

export const VerificationTokenModel = mongoose.model<IVerificationToken>(
  'VerificationToken',
  VerificationTokenSchema,
);
