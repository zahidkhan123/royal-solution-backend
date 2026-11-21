import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import Project from "../models/Project.model.js";
import Property from "../models/Property.model.js";
import Client from "../models/Client.model.js";
import Job from "../models/Job.model.js";
import Quote from "../models/Quote.model.js";
import Invoice from "../models/Invoice.model.js";
import WeeklyReport from "../models/WeeklyReport.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import {
  PROJECT_MEMBER_ROLES,
  PROJECT_STATUSES,
  isOwnedBy,
  type ProjectMemberRole,
  type ProjectStatus,
} from "../constants/maintenance.js";

const projectPopulate = [
  { path: "client", select: "name email phone contactPerson" },
  {
    path: "property",
    select: "name address city postalCode country client",
  },
  { path: "members.contact", select: "name email phone contactPerson" },
];

function sortSections<T extends { sections?: { order?: number }[] }>(doc: T): T {
  doc.sections?.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return doc;
}

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

async function loadOwnedProject(id: string, user: { _id?: unknown }) {
  if (!mongoose.isValidObjectId(id)) return null;
  const project = await Project.findById(id);
  if (!project || !isOwnedBy(project.owner, user)) return null;
  return project;
}

function parseReportDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseNotes(raw: unknown): { text: string; job?: string }[] {
  if (!Array.isArray(raw)) return [];
  const notes: { text: string; job?: string }[] = [];
  for (const row of raw.slice(0, 100)) {
    if (!row || typeof row !== "object") continue;
    const text = String((row as { text?: unknown }).text || "").trim();
    if (!text) continue;
    const jobRaw = (row as { jobId?: unknown; job?: unknown }).jobId
      ?? (row as { job?: unknown }).job;
    const job =
      typeof jobRaw === "string" && mongoose.isValidObjectId(jobRaw)
        ? jobRaw
        : undefined;
    notes.push({ text: text.slice(0, 2000), job });
  }
  return notes;
}

function parseAttendance(
  raw: unknown
): { date: Date; siteManagers: number; labourers: number }[] {
  if (!Array.isArray(raw)) return [];
  const rows: { date: Date; siteManagers: number; labourers: number }[] = [];
  for (const row of raw.slice(0, 31)) {
    if (!row || typeof row !== "object") continue;
    const date = parseReportDate((row as { date?: unknown }).date);
    if (!date) continue;
    const siteManagers = Math.max(
      0,
      Math.round(Number((row as { siteManagers?: unknown }).siteManagers) || 0)
    );
    const labourers = Math.max(
      0,
      Math.round(Number((row as { labourers?: unknown }).labourers) || 0)
    );
    rows.push({ date, siteManagers, labourers });
  }
  return rows;
}

function parsePhotos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

export const listProjects = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const statusRaw =
      typeof req.query.status === "string" ? req.query.status : "active";

    const filter: Record<string, unknown> = { owner: user._id };
    if (statusRaw !== "all" && PROJECT_STATUSES.includes(statusRaw as ProjectStatus)) {
      filter.status = statusRaw;
    } else if (statusRaw !== "all") {
      filter.status = "active";
    }
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.name = re;
    }

    const projects = await Project.find(filter)
      .populate("client", "name")
      .populate("property", "name address city")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.status(200).json({ success: true, data: { projects } });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const name = String(req.body.name || "").trim();
    const propertyId = String(req.body.propertyId || "");
    if (!name) {
      res.status(400).json({ success: false, message: "Project name is required" });
      return;
    }
    // Only the name is required; site, contact, colour and description are optional.
    let property: InstanceType<typeof Property> | null = null;
    if (propertyId) {
      if (!mongoose.isValidObjectId(propertyId)) {
        res.status(400).json({ success: false, message: "Invalid site" });
        return;
      }
      property = await Property.findById(propertyId);
      if (!property || !property.isActive) {
        res.status(404).json({ success: false, message: "Property not found" });
        return;
      }
      if (!isOwnedBy(property.owner, req.user)) {
        res.status(403).json({ success: false, message: "Not authorized" });
        return;
      }
    }

    let clientId = req.body.clientId ? String(req.body.clientId) : "";
    if (!clientId && property?.client) clientId = String(property.client);
    if (clientId) {
      const client = await Client.findById(clientId);
      if (!client || !client.isActive || !isOwnedBy(client.createdBy, req.user)) {
        res.status(400).json({ success: false, message: "Contact not found" });
        return;
      }
    }

    const colorRaw = String(req.body.color || "").trim();
    const color = isHexColor(colorRaw) ? colorRaw : "#158FAD";

    const project = await Project.create({
      owner: req.user!._id,
      name,
      color,
      description: String(req.body.description || "").trim() || undefined,
      client: clientId || undefined,
      property: property?._id ?? null,
      status: "active",
    });

    const populated = await Project.findById(project._id).populate(projectPopulate);
    res.status(201).json({
      success: true,
      message: "Project created",
      data: { project: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const getProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await Project.findById(req.params.id)
      .populate(projectPopulate)
      .lean();
    if (!project || !isOwnedBy(project.owner, req.user)) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    sortSections(project);

    const userId = req.user!._id;
    const [jobs, quotes, invoices, reports] = await Promise.all([
      Job.find({ project: project._id, owner: userId })
        .populate("property", "name address")
        .sort({ priorityRank: 1, createdAt: -1 })
        .limit(200)
        .lean(),
      Quote.find({ project: project._id, createdBy: userId })
        .select("quoteNumber status grandTotal currency issueDate client")
        .populate("client", "name")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Invoice.find({ project: project._id, createdBy: userId })
        .select("invoiceNumber status grandTotal currency issueDate client")
        .populate("client", "name")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      WeeklyReport.find({ project: project._id, owner: userId })
        .sort({ reportDate: -1 })
        .limit(52)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: { project, jobs, quotes, invoices, reports },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) {
        res.status(400).json({ success: false, message: "Project name is required" });
        return;
      }
      project.name = name;
    }
    if (req.body.description !== undefined) {
      project.description = String(req.body.description || "").trim();
    }
    if (req.body.color !== undefined) {
      const color = String(req.body.color || "").trim();
      if (!isHexColor(color)) {
        res.status(400).json({ success: false, message: "Colour must be a hex value" });
        return;
      }
      project.color = color;
    }
    if (req.body.status !== undefined) {
      const status = String(req.body.status) as ProjectStatus;
      if (!PROJECT_STATUSES.includes(status)) {
        res.status(400).json({ success: false, message: "Invalid status" });
        return;
      }
      project.status = status;
    }
    if (req.body.clientId !== undefined) {
      if (req.body.clientId === null || req.body.clientId === "") {
        project.client = undefined;
      } else {
        const client = await Client.findById(String(req.body.clientId));
        if (!client || !client.isActive || !isOwnedBy(client.createdBy, req.user)) {
          res.status(400).json({ success: false, message: "Contact not found" });
          return;
        }
        project.client = client._id as mongoose.Types.ObjectId;
      }
    }
    await project.save();
    const populated = await Project.findById(project._id).populate(projectPopulate);
    res.status(200).json({
      success: true,
      message: "Project updated",
      data: { project: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const archiveProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    project.status = project.status === "archived" ? "active" : "archived";
    await project.save();
    res.status(200).json({
      success: true,
      message: project.status === "archived" ? "Project archived" : "Project restored",
      data: { project },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const id = project._id;
    const owner = req.user!._id;
    await Promise.all([
      Job.updateMany(
        { project: id, owner },
        { $unset: { project: 1, section: 1 } }
      ),
      Quote.updateMany({ project: id, createdBy: owner }, { $unset: { project: 1 } }),
      Invoice.updateMany(
        { project: id, createdBy: owner },
        { $unset: { project: 1 } }
      ),
      WeeklyReport.deleteMany({ project: id, owner }),
    ]);
    await project.deleteOne();
    res.status(200).json({ success: true, message: "Project deleted" });
  } catch (error) {
    next(error);
  }
};

export const addSection = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const name = String(req.body.name || "").trim();
    if (!name) {
      res.status(400).json({ success: false, message: "Section name is required" });
      return;
    }
    const order =
      project.sections.reduce((max, section) => Math.max(max, section.order), -1) + 1;
    project.sections.push({ name, order });
    await project.save();
    sortSections(project);
    res.status(201).json({
      success: true,
      message: "Section added",
      data: { project },
    });
  } catch (error) {
    next(error);
  }
};

export const updateSection = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const section = project.sections.id(req.params.sectionId);
    if (!section) {
      res.status(404).json({ success: false, message: "Section not found" });
      return;
    }
    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) {
        res.status(400).json({ success: false, message: "Section name is required" });
        return;
      }
      section.name = name;
    }
    await project.save();
    res.status(200).json({ success: true, data: { project } });
  } catch (error) {
    next(error);
  }
};

export const deleteSection = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const section = project.sections.id(req.params.sectionId);
    if (!section) {
      res.status(404).json({ success: false, message: "Section not found" });
      return;
    }
    const sectionId = section._id;
    project.sections.pull(sectionId);
    await project.save();
    await Job.updateMany(
      { project: project._id, section: sectionId },
      { $unset: { section: 1 } }
    );
    res.status(200).json({
      success: true,
      message: "Section removed",
      data: { project },
    });
  } catch (error) {
    next(error);
  }
};

export const reorderSections = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const ids = Array.isArray(req.body.sectionIds)
      ? req.body.sectionIds.map((id: unknown) => String(id))
      : [];
    project.sections.forEach((section) => {
      const index = ids.indexOf(String(section._id));
      section.order = index === -1 ? 1000 + section.order : index;
    });
    await project.save();
    sortSections(project);
    res.status(200).json({ success: true, data: { project } });
  } catch (error) {
    next(error);
  }
};

export const addMember = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const contactId = String(req.body.contactId || "");
    if (!mongoose.isValidObjectId(contactId)) {
      res.status(400).json({ success: false, message: "Contact is required" });
      return;
    }
    const client = await Client.findById(contactId);
    if (!client || !client.isActive || !isOwnedBy(client.createdBy, req.user)) {
      res.status(404).json({ success: false, message: "Contact not found" });
      return;
    }
    const role = String(req.body.role || "other") as ProjectMemberRole;
    if (!PROJECT_MEMBER_ROLES.includes(role)) {
      res.status(400).json({ success: false, message: "Invalid role" });
      return;
    }
    const existing = project.members.find(
      (member) => String(member.contact) === contactId
    );
    if (existing) {
      existing.role = role;
    } else {
      project.members.push({ contact: client._id, role });
    }
    await project.save();
    const populated = await Project.findById(project._id).populate(projectPopulate);
    res.status(201).json({
      success: true,
      message: "Person added",
      data: { project: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const member = project.members.id(req.params.memberId);
    if (!member) {
      res.status(404).json({ success: false, message: "Person not found" });
      return;
    }
    project.members.pull(member._id);
    await project.save();
    const populated = await Project.findById(project._id).populate(projectPopulate);
    res.status(200).json({
      success: true,
      message: "Person removed",
      data: { project: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const listReports = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const reports = await WeeklyReport.find({
      project: project._id,
      owner: req.user!._id,
    })
      .sort({ reportDate: -1 })
      .lean();
    res.status(200).json({ success: true, data: { reports } });
  } catch (error) {
    next(error);
  }
};

export const createReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const reportDate = parseReportDate(req.body.reportDate) || new Date();
    const report = await WeeklyReport.create({
      owner: req.user!._id,
      project: project._id,
      reportDate,
      notes: parseNotes(req.body.notes),
      attendance: parseAttendance(req.body.attendance),
      photos: parsePhotos(req.body.photos),
    });
    res.status(201).json({
      success: true,
      message: "Weekly report saved",
      data: { report },
    });
  } catch (error) {
    next(error);
  }
};

export const getReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const report = await WeeklyReport.findOne({
      _id: req.params.reportId,
      project: project._id,
      owner: req.user!._id,
    })
      .populate("notes.job", "title status")
      .lean();
    if (!report) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }
    res.status(200).json({ success: true, data: { report, project } });
  } catch (error) {
    next(error);
  }
};

export const updateReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const report = await WeeklyReport.findOne({
      _id: req.params.reportId,
      project: project._id,
      owner: req.user!._id,
    });
    if (!report) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }
    if (req.body.reportDate !== undefined) {
      const reportDate = parseReportDate(req.body.reportDate);
      if (!reportDate) {
        res.status(400).json({ success: false, message: "Invalid report date" });
        return;
      }
      report.reportDate = reportDate;
    }
    if (req.body.notes !== undefined) {
      report.notes.splice(0, report.notes.length, ...parseNotes(req.body.notes));
    }
    if (req.body.attendance !== undefined) {
      report.attendance.splice(
        0,
        report.attendance.length,
        ...parseAttendance(req.body.attendance)
      );
    }
    if (req.body.photos !== undefined) {
      report.photos = parsePhotos(req.body.photos);
    }
    await report.save();
    res.status(200).json({
      success: true,
      message: "Weekly report updated",
      data: { report },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req.params.id, req.user!);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    const report = await WeeklyReport.findOne({
      _id: req.params.reportId,
      project: project._id,
      owner: req.user!._id,
    });
    if (!report) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }
    await report.deleteOne();
    res.status(200).json({ success: true, message: "Report deleted" });
  } catch (error) {
    next(error);
  }
};
