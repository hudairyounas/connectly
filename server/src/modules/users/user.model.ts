import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPrivacySettings {
  onlineVisibility: 'everyone' | 'nobody';
  lastSeenVisibility: 'everyone' | 'nobody';
  readReceipts: boolean;
  profileVisibility: 'everyone' | 'contacts';
}

export interface INotificationSettings {
  inAppEnabled: boolean;
  soundEnabled: boolean;
  showPreview: boolean;
}

export interface IAppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  reducedMotion: boolean;
  enterToSend: boolean;
}

export interface IUserAttrs {
  _id: Types.ObjectId;
  displayName: string;
  username: string;
  email: string;
  passwordHash: string;
  avatar: string | null;
  bio: string;
  statusText: string;
  availability: 'online' | 'away' | 'busy' | 'offline';
  isOnline: boolean;
  lastSeenAt: Date;
  emailVerified: boolean;
  isDeleted: boolean;
  blockedUsers: Types.ObjectId[];
  privacySettings: IPrivacySettings;
  notificationSettings: INotificationSettings;
  appearanceSettings: IAppearanceSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUser extends IUserAttrs, Document {
  _id: Types.ObjectId;
}

const UserSchema = new Schema<IUser>(
  {
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 32,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    avatar: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      default: '',
      maxlength: 250,
    },
    statusText: {
      type: String,
      default: 'Available',
      maxlength: 80,
    },
    availability: {
      type: String,
      enum: ['online', 'away', 'busy', 'offline'],
      default: 'online',
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    blockedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    privacySettings: {
      onlineVisibility: {
        type: String,
        enum: ['everyone', 'nobody'],
        default: 'everyone',
      },
      lastSeenVisibility: {
        type: String,
        enum: ['everyone', 'nobody'],
        default: 'everyone',
      },
      readReceipts: {
        type: Boolean,
        default: true,
      },
      profileVisibility: {
        type: String,
        enum: ['everyone', 'contacts'],
        default: 'everyone',
      },
    },
    notificationSettings: {
      inAppEnabled: {
        type: Boolean,
        default: true,
      },
      soundEnabled: {
        type: Boolean,
        default: true,
      },
      showPreview: {
        type: Boolean,
        default: true,
      },
    },
    appearanceSettings: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'light',
      },
      reducedMotion: {
        type: Boolean,
        default: false,
      },
      enterToSend: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

UserSchema.index({ displayName: 'text', username: 'text' });

export const UserModel = mongoose.model<IUser>('User', UserSchema);

export function sanitizePublicUser(
  user: Partial<IUserAttrs> & { _id: Types.ObjectId | string },
  viewerId?: string,
) {
  const isSelf = viewerId && String(user._id) === String(viewerId);
  if (user.isDeleted) {
    return {
      _id: String(user._id),
      displayName: 'Deleted Account',
      username: 'deleted',
      avatar: null,
      bio: '',
      statusText: '',
      availability: 'offline',
      isOnline: false,
      lastSeenAt: null,
      isDeleted: true,
    };
  }

  const showOnline = isSelf || user.privacySettings?.onlineVisibility !== 'nobody';
  const showLastSeen = isSelf || user.privacySettings?.lastSeenVisibility !== 'nobody';

  return {
    _id: String(user._id),
    displayName: user.displayName || 'Unknown User',
    username: user.username || 'unknown',
    ...(isSelf ? { email: user.email, emailVerified: user.emailVerified } : {}),
    avatar: user.avatar ?? null,
    bio: user.bio ?? '',
    statusText: user.statusText ?? 'Available',
    availability: showOnline ? (user.availability ?? 'online') : 'offline',
    isOnline: showOnline ? Boolean(user.isOnline) : false,
    lastSeenAt: showLastSeen && user.lastSeenAt ? new Date(user.lastSeenAt).toISOString() : null,
    isDeleted: Boolean(user.isDeleted),
    ...(isSelf
      ? {
          privacySettings: user.privacySettings,
          notificationSettings: user.notificationSettings,
          appearanceSettings: user.appearanceSettings,
          blockedUsers: (user.blockedUsers || []).map(String),
          createdAt: user.createdAt,
        }
      : {}),
  };
}
