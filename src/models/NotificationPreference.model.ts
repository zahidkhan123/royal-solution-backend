import mongoose, { Document, Schema } from "mongoose";

/**
 * Push / local notification preferences and device tokens.
 */
export interface INotificationPreference extends Document {
  userId: mongoose.Types.ObjectId;
  pushEnabled: boolean;
  emailEnabled: boolean;
  /** Optional IANA timezone for scheduling */
  preferredTimezone?: string;
  /** FCM / APNs device tokens */
  pushTokens: string[];
  createdAt: Date;
  updatedAt: Date;
}

const notificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    pushEnabled: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: true },
    preferredTimezone: { type: String, trim: true, maxlength: 64 },
    pushTokens: {
      type: [String],
      default: [],
      validate: {
        validator: (arr: string[]) => arr.length <= 20,
        message: "At most 20 push tokens per user",
      },
    },
  },
  { timestamps: true }
);

notificationPreferenceSchema.index({ userId: 1 });

const NotificationPreference = mongoose.model<INotificationPreference>(
  "NotificationPreference",
  notificationPreferenceSchema
);
export default NotificationPreference;
