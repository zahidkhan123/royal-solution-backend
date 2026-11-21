import mongoose, { Document, Schema } from "mongoose";
import {
  PROJECT_COLORS,
  PROJECT_MEMBER_ROLES,
  PROJECT_STATUSES,
  type ProjectMemberRole,
  type ProjectStatus,
} from "../constants/maintenance.js";

export interface IProjectSection {
  _id: mongoose.Types.ObjectId;
  name: string;
  order: number;
}

export interface IProjectMember {
  _id: mongoose.Types.ObjectId;
  contact: mongoose.Types.ObjectId;
  role: ProjectMemberRole;
}

export interface IProject extends Document {
  owner: mongoose.Types.ObjectId;
  name: string;
  color: string;
  description?: string;
  client?: mongoose.Types.ObjectId;
  property?: mongoose.Types.ObjectId | null;
  status: ProjectStatus;
  sections: mongoose.Types.DocumentArray<IProjectSection>;
  members: mongoose.Types.DocumentArray<IProjectMember>;
  createdAt: Date;
  updatedAt: Date;
}

const sectionSchema = new Schema<IProjectSection>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  order: { type: Number, default: 0 },
});

const memberSchema = new Schema<IProjectMember>({
  contact: {
    type: Schema.Types.ObjectId,
    ref: "Client",
    required: true,
  },
  role: {
    type: String,
    enum: PROJECT_MEMBER_ROLES,
    default: "other",
  },
});

const projectSchema = new Schema<IProject>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
      maxlength: 120,
    },
    color: {
      type: String,
      trim: true,
      default: PROJECT_COLORS[5],
    },
    description: { type: String, trim: true, maxlength: 2000 },
    client: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      index: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: PROJECT_STATUSES,
      default: "active",
      index: true,
    },
    sections: [sectionSchema],
    members: [memberSchema],
  },
  { timestamps: true }
);

projectSchema.index({ owner: 1, status: 1, createdAt: -1 });
projectSchema.index({ name: "text", description: "text" });

export default mongoose.model<IProject>("Project", projectSchema);
