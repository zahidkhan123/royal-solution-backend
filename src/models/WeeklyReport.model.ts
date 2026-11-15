import mongoose, { Document, Schema } from "mongoose";

export interface IWeeklyReportNote {
  _id: mongoose.Types.ObjectId;
  text: string;
  job?: mongoose.Types.ObjectId;
}

export interface IWeeklyAttendance {
  _id: mongoose.Types.ObjectId;
  date: Date;
  siteManagers: number;
  labourers: number;
}

export interface IWeeklyReport extends Document {
  owner: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  reportDate: Date;
  notes: mongoose.Types.DocumentArray<IWeeklyReportNote>;
  attendance: mongoose.Types.DocumentArray<IWeeklyAttendance>;
  photos: string[];
  createdAt: Date;
  updatedAt: Date;
}

const noteSchema = new Schema<IWeeklyReportNote>({
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  job: { type: Schema.Types.ObjectId, ref: "Job" },
});

const attendanceSchema = new Schema<IWeeklyAttendance>({
  date: { type: Date, required: true },
  siteManagers: { type: Number, default: 0, min: 0 },
  labourers: { type: Number, default: 0, min: 0 },
});

const weeklyReportSchema = new Schema<IWeeklyReport>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    reportDate: { type: Date, required: true, index: true },
    notes: [noteSchema],
    attendance: [attendanceSchema],
    photos: [{ type: String }],
  },
  { timestamps: true }
);

weeklyReportSchema.index({ project: 1, reportDate: -1 });

export default mongoose.model<IWeeklyReport>("WeeklyReport", weeklyReportSchema);
