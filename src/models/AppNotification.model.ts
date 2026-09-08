import mongoose, { Document, Schema } from "mongoose";

export type NotificationType =
  | "job_created"
  | "job_assigned"
  | "priority_changed"
  | "status_updated"
  | "invoice_generated"
  | "payment_received"
  | "deposit_requested"
  | "quote_sent"
  | "quote_accepted"
  | "quote_declined"
  | "general";

export interface IAppNotification extends Document {
  user: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<IAppNotification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "job_created",
        "job_assigned",
        "priority_changed",
        "status_updated",
        "invoice_generated",
        "payment_received",
        "deposit_requested",
        "quote_sent",
        "quote_accepted",
        "quote_declined",
        "general",
      ],
      default: "general",
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    data: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model<IAppNotification>(
  "AppNotification",
  notificationSchema
);
