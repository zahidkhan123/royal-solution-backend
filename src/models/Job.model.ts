import mongoose, { Document, Schema } from "mongoose";
import {
  JOB_CATEGORIES,
  JOB_PRIORITIES,
  JOB_STATUSES,
  PRIORITY_RANK,
  type JobPriority,
  type JobStatus,
} from "../constants/maintenance.js";

export interface IJobTimelineEntry {
  status: JobStatus;
  note?: string;
  changedBy?: mongoose.Types.ObjectId;
  at: Date;
}

export interface IJob extends Document {
  owner: mongoose.Types.ObjectId;
  /** Site is optional — a job can be logged before a contact/site exists. */
  property?: mongoose.Types.ObjectId | null;
  title: string;
  description?: string;
  category: string;
  priority: JobPriority;
  priorityRank: number;
  status: JobStatus;
  preferredVisitDate?: Date;
  preferredTime?: string;
  photos: string[];
  attachments: { name: string; url: string }[];
  assignedTechnician?: mongoose.Types.ObjectId;
  /** Free-text name when admin assigns without a user account */
  assignedTechnicianName?: string;
  assignedAt?: Date;
  invoice?: mongoose.Types.ObjectId;
  /** Programme of work this job is filed under. Missing means Inbox. */
  project?: mongoose.Types.ObjectId | null;
  /** Section subdocument id on that project. */
  section?: mongoose.Types.ObjectId | null;
  timeline: IJobTimelineEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Job title is required"],
      trim: true,
      maxlength: 200,
    },
    description: { type: String, trim: true, maxlength: 5000 },
    category: {
      type: String,
      enum: JOB_CATEGORIES,
      default: "other",
    },
    priority: {
      type: String,
      enum: JOB_PRIORITIES,
      default: "P4",
    },
    priorityRank: {
      type: Number,
      default: 4,
      index: true,
    },
    status: {
      type: String,
      enum: JOB_STATUSES,
      default: "pending",
      index: true,
    },
    preferredVisitDate: { type: Date },
    preferredTime: { type: String, trim: true },
    photos: [{ type: String }],
    attachments: [
      {
        name: String,
        url: String,
      },
    ],
    assignedTechnician: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    assignedTechnicianName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    assignedAt: { type: Date },
    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },
    section: {
      type: Schema.Types.ObjectId,
    },
    timeline: [
      {
        status: { type: String, enum: JOB_STATUSES },
        note: String,
        changedBy: { type: Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

jobSchema.pre("save", function (next) {
  if (this.isModified("priority") || this.isNew) {
    this.priorityRank = PRIORITY_RANK[this.priority as JobPriority] ?? 4;
  }
  if (this.isNew && (!this.timeline || this.timeline.length === 0)) {
    this.timeline = [
      {
        status: "pending",
        note: "Job created",
        changedBy: this.owner,
        at: new Date(),
      },
    ];
  }
  next();
});

jobSchema.index({ status: 1, priorityRank: 1, createdAt: -1 });
jobSchema.index({ owner: 1, status: 1 });
jobSchema.index({ owner: 1, project: 1, section: 1 });
jobSchema.index({ title: "text", description: "text" });

export default mongoose.model<IJob>("Job", jobSchema);
