import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import Job from "../models/Job.model.js";
import Property from "../models/Property.model.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import {
  JOB_PRIORITIES,
  JOB_STATUSES,
  PRIORITY_RANK,
  isStaffRole,
  isOwnedBy,
  parseJobQuickEntry,
  type JobPriority,
  type JobStatus,
} from "../constants/maintenance.js";
import {
  createNotification,
  notifyAdmins,
} from "../services/appNotification.service.js";
import {
  resolveProjectAssignment,
  resolveSectionId,
} from "../utils/projectLink.js";

export const listJobs = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20)
    );
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const priority =
      typeof req.query.priority === "string" ? req.query.priority : undefined;
    const category =
      typeof req.query.category === "string" ? req.query.category : undefined;
    const propertyId =
      typeof req.query.property === "string" ? req.query.property : undefined;
    const projectId =
      typeof req.query.project === "string" ? req.query.project : undefined;
    const inbox =
      req.query.inbox === "1" || req.query.inbox === "true";

    const filter: Record<string, unknown> = { owner: user._id };

    if (status) filter.status = status;
    if (priority && JOB_PRIORITIES.includes(priority as JobPriority)) {
      filter.priority = priority;
    }
    if (category) filter.category = category;
    if (propertyId) filter.property = propertyId;
    if (projectId) filter.project = projectId;
    else if (inbox) filter.project = null;

    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: re }, { description: re }];
    }

    // Month / date range: match preferred visit date when set, else createdAt
    // (same rule the app uses for calendar placement).
    if (req.query.from || req.query.to) {
      const range: Record<string, Date> = {};
      if (req.query.from) range.$gte = new Date(String(req.query.from));
      if (req.query.to) range.$lte = new Date(String(req.query.to));
      const dateOr = [
        { preferredVisitDate: range },
        {
          $and: [
            {
              $or: [
                { preferredVisitDate: null },
                { preferredVisitDate: { $exists: false } },
              ],
            },
            { createdAt: range },
          ],
        },
      ];
      if (filter.$or) {
        // Combine with existing text search $or via $and
        filter.$and = [{ $or: filter.$or as unknown[] }, { $or: dateOr }];
        delete filter.$or;
      } else {
        filter.$or = dateOr;
      }
    }

    const [total, jobs] = await Promise.all([
      Job.countDocuments(filter),
      Job.find(filter)
        .populate("property", "name address city")
        .populate("owner", "fullName email phone")
        .populate("assignedTechnician", "fullName email phone")
        .populate("project", "name color")
        .sort({ priorityRank: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: { jobs },
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getJob = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const job = await Job.findById(req.params.id)
      .populate({
        path: "property",
        populate: {
          path: "client",
          select: "name email phone contactPerson",
        },
      })
      .populate("owner", "fullName email phone")
      .populate("assignedTechnician", "fullName email phone")
      .populate("invoice")
      .lean();

    if (!job) {
      res.status(404).json({ success: false, message: "Job not found" });
      return;
    }

    if (!isOwnedBy(job.owner, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    res.status(200).json({ success: true, data: { job } });
  } catch (error) {
    next(error);
  }
};

export const createJob = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      propertyId,
      title: rawTitle,
      description,
      category,
      photos,
      preferredVisitDate,
      preferredTime,
      priority: rawPriority,
      attachments,
      projectId,
      sectionId,
      technicianName: rawTechnicianName,
      technicianId: rawTechnicianId,
      assignedTechnicianName,
      assignedTechnicianId,
    } = req.body;

    // Site (and so contact) is optional.
    let jobPropertyId: mongoose.Types.ObjectId | undefined;
    if (propertyId) {
      const property = await Property.findById(propertyId);
      if (!property || !property.isActive) {
        res.status(404).json({ success: false, message: "Property not found" });
        return;
      }

      if (!isOwnedBy(property.owner, req.user)) {
        res.status(403).json({
          success: false,
          message: "You can only create jobs for your own properties",
        });
        return;
      }
      jobPropertyId = property._id as mongoose.Types.ObjectId;
    }

    let linkedProject: mongoose.Types.ObjectId | undefined;
    let linkedSection: mongoose.Types.ObjectId | undefined;
    if (projectId) {
      const link = await resolveProjectAssignment({
        user: req.user!,
        projectId,
        propertyId,
      });
      if (!link.ok) {
        res.status(link.status).json({ success: false, message: link.message });
        return;
      }
      if (!link.cleared && link.projectId) {
        linkedProject = link.projectId;
        // A job without a site picks up its project's site, if it has one.
        if (!jobPropertyId && link.propertyId) jobPropertyId = link.propertyId;
        if (sectionId) {
          const section = await resolveSectionId(link.projectId, sectionId);
          if (!section.ok) {
            res
              .status(section.status)
              .json({ success: false, message: section.message });
            return;
          }
          if (section.sectionId) linkedSection = section.sectionId;
        }
      }
    }

    // Todoist-style quick entry: parse p1–p4 from title
    const parsed = parseJobQuickEntry(rawTitle || "");
    let title = parsed.title;
    let priority: JobPriority = parsed.priority;

    if (
      rawPriority &&
      JOB_PRIORITIES.includes(String(rawPriority).toUpperCase() as JobPriority)
    ) {
      // Explicit priority wins if provided separately and title had no tag
      if (!/\bp[1-4]\b/i.test(rawTitle || "")) {
        priority = String(rawPriority).toUpperCase() as JobPriority;
      }
    }

    if (!title?.trim()) {
      res.status(400).json({ success: false, message: "Job title is required" });
      return;
    }

    const technicianName = String(
      rawTechnicianName || assignedTechnicianName || ""
    ).trim();
    const technicianId = String(
      rawTechnicianId || assignedTechnicianId || ""
    ).trim();
    const hasAssignee = Boolean(technicianName || technicianId);

    const timeline: {
      status: JobStatus;
      note: string;
      changedBy: mongoose.Types.ObjectId;
      at: Date;
    }[] = [
      {
        status: "pending",
        note: "Job created",
        changedBy: req.user!._id as unknown as mongoose.Types.ObjectId,
        at: new Date(),
      },
    ];

    if (hasAssignee) {
      timeline.push({
        status: "assigned",
        note: technicianName
          ? `Assigned to ${technicianName}`
          : "Employee assigned",
        changedBy: req.user!._id as unknown as mongoose.Types.ObjectId,
        at: new Date(),
      });
    }

    const job = await Job.create({
      owner: req.user!._id,
      property: jobPropertyId ?? null,
      title: title.trim(),
      description,
      category: category || "other",
      priority,
      priorityRank: PRIORITY_RANK[priority],
      status: hasAssignee ? "assigned" : "pending",
      preferredVisitDate: preferredVisitDate
        ? new Date(preferredVisitDate)
        : undefined,
      preferredTime,
      photos: Array.isArray(photos) ? photos : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      assignedTechnician: technicianId || undefined,
      assignedTechnicianName: technicianName || undefined,
      assignedAt: hasAssignee ? new Date() : undefined,
      project: linkedProject,
      section: linkedSection,
      timeline,
    });

    await notifyAdmins({
      type: "job_created",
      title: "New maintenance job",
      body: `${priority} · ${title.trim()}`,
      data: { jobId: String(job._id), priority },
    });

    const populated = await Job.findById(job._id)
      .populate("property", "name address city")
      .lean();

    res.status(201).json({
      success: true,
      message: "Job created",
      data: { job: populated },
    });
  } catch (error) {
    next(error);
  }
};

async function applyJobProject(
  job: InstanceType<typeof Job>,
  body: { projectId?: unknown; sectionId?: unknown },
  user: { _id?: unknown }
): Promise<{ status: number; message: string } | null> {
  const setsProject = body.projectId !== undefined;
  const setsSection = body.sectionId !== undefined;

  if (setsProject && (body.projectId === null || body.projectId === "")) {
    job.set("project", null);
    job.set("section", null);
    return null;
  }

  const projectId = setsProject ? body.projectId : job.project;
  if (!projectId) {
    return { status: 400, message: "Choose a project before setting a section" };
  }

  const link = await resolveProjectAssignment({
    user,
    projectId,
    propertyId: job.property,
  });
  if (!link.ok) return { status: link.status, message: link.message };
  if (link.cleared || !link.projectId) {
    job.set("project", null);
    job.set("section", null);
    return null;
  }

  job.set("project", link.projectId);
  // A job without a site picks up its project's site when filed.
  if (!job.property && link.propertyId) job.set("property", link.propertyId);

  if (setsSection) {
    const section = await resolveSectionId(link.projectId, body.sectionId);
    if (!section.ok) return { status: section.status, message: section.message };
    job.set("section", section.sectionId);
    return null;
  }

  if (job.section) {
    const stillThere = await resolveSectionId(link.projectId, job.section);
    if (!stillThere.ok || !stillThere.sectionId) job.set("section", null);
  }
  return null;
}

export const updateJob = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      res.status(404).json({ success: false, message: "Job not found" });
      return;
    }

    const admin = isStaffRole(req.user!.role);
    const isOwner = isOwnedBy(job.owner, req.user);

    if (!isOwner) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    if (req.body.projectId !== undefined || req.body.sectionId !== undefined) {
      const filingError = await applyJobProject(job, req.body, req.user!);
      if (filingError) {
        res.status(filingError.status).json({
          success: false,
          message: filingError.message,
        });
        return;
      }
    }

    const filingKeys = new Set(["projectId", "sectionId"]);
    const hasOtherEdits = Object.keys(req.body).some((key) => !filingKeys.has(key));

    // Users can only edit limited fields while pending
    if (!admin) {
      if (job.status !== "pending" && hasOtherEdits) {
        res.status(400).json({
          success: false,
          message: "Only pending jobs can be edited",
        });
        return;
      }
      if (job.status !== "pending") {
        await job.save();
        const populatedEarly = await Job.findById(job._id)
          .populate("property", "name address city")
          .populate("project", "name color")
          .lean();
        res.status(200).json({
          success: true,
          message: "Job updated",
          data: { job: populatedEarly },
        });
        return;
      }
      const allowed = [
        "title",
        "description",
        "category",
        "photos",
        "preferredVisitDate",
        "preferredTime",
        "attachments",
        "priority",
      ];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          if (key === "title") {
            const parsed = parseJobQuickEntry(req.body.title);
            job.title = parsed.title;
            if (/\bp[1-4]\b/i.test(req.body.title)) {
              job.priority = parsed.priority;
              job.priorityRank = PRIORITY_RANK[parsed.priority];
            }
          } else if (key === "priority") {
            const p = String(req.body.priority).toUpperCase() as JobPriority;
            if (JOB_PRIORITIES.includes(p)) {
              job.priority = p;
              job.priorityRank = PRIORITY_RANK[p];
            }
          } else if (key === "preferredVisitDate") {
            job.preferredVisitDate = req.body.preferredVisitDate
              ? new Date(req.body.preferredVisitDate)
              : undefined;
          } else {
            (job as unknown as Record<string, unknown>)[key] = req.body[key];
          }
        }
      }
    } else {
      // Admin: priority, assignment, description, category, etc.
      if (req.body.priority !== undefined) {
        const p = String(req.body.priority).toUpperCase() as JobPriority;
        if (JOB_PRIORITIES.includes(p) && p !== job.priority) {
          const old = job.priority;
          job.priority = p;
          job.priorityRank = PRIORITY_RANK[p];
          await createNotification({
            userId: job.owner,
            type: "priority_changed",
            title: "Priority updated",
            body: `Job priority changed from ${old} to ${p}`,
            data: { jobId: String(job._id), priority: p },
          });
        }
      }
      if (req.body.title !== undefined) job.title = req.body.title;
      if (req.body.description !== undefined)
        job.description = req.body.description;
      if (req.body.category !== undefined) job.category = req.body.category;
      if (req.body.photos !== undefined) job.photos = req.body.photos;
    }

    await job.save();
    const populated = await Job.findById(job._id)
      .populate("property", "name address city")
      .populate("assignedTechnician", "fullName email phone")
      .populate("project", "name color")
      .lean();

    res.status(200).json({
      success: true,
      message: "Job updated",
      data: { job: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const updateJobStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      // Users may cancel their own pending jobs
      const job = await Job.findById(req.params.id);
      if (!job) {
        res.status(404).json({ success: false, message: "Job not found" });
        return;
      }
      if (String(job.owner) !== String(req.user!._id)) {
        res.status(403).json({ success: false, message: "Not authorized" });
        return;
      }
      if (req.body.status !== "cancelled" || job.status !== "pending") {
        res.status(403).json({
          success: false,
          message: "You can only cancel pending jobs",
        });
        return;
      }
      job.status = "cancelled";
      job.timeline.push({
        status: "cancelled",
        note: req.body.note || "Cancelled by owner",
        changedBy: job.owner,
        at: new Date(),
      });
      await job.save();
      await notifyAdmins({
        type: "status_updated",
        title: "Job cancelled",
        body: job.title,
        data: { jobId: String(job._id), status: "cancelled" },
      });
      res.status(200).json({
        success: true,
        message: "Job cancelled",
        data: { job },
      });
      return;
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      res.status(404).json({ success: false, message: "Job not found" });
      return;
    }
    if (!isOwnedBy(job.owner, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    const status = String(req.body.status) as JobStatus;
    if (!JOB_STATUSES.includes(status)) {
      res.status(400).json({ success: false, message: "Invalid status" });
      return;
    }

    job.status = status;
    job.timeline.push({
      status,
      note: req.body.note || `Status → ${status}`,
      changedBy: job.assignedTechnician || job.owner,
      at: new Date(),
    });
    await job.save();

    const statusLabels: Record<string, string> = {
      assigned: "Your job has been assigned.",
      accepted: "Technician accepted your job.",
      in_progress: "Technician is working on your job.",
      completed: "Your job has been completed.",
      cancelled: "Your job was cancelled.",
      rejected: "Your job was rejected.",
      pending: "Job is pending.",
    };

    await createNotification({
      userId: job.owner,
      type: "status_updated",
      title: "Job status updated",
      body: statusLabels[status] || `Status: ${status}`,
      data: { jobId: String(job._id), status },
    });

    const populated = await Job.findById(job._id)
      .populate("property", "name address city")
      .populate("assignedTechnician", "fullName email phone")
      .lean();

    res.status(200).json({
      success: true,
      message: "Status updated",
      data: { job: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const assignJob = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!isStaffRole(req.user!.role)) {
      res.status(403).json({ success: false, message: "Admin only" });
      return;
    }

    const job = await Job.findById(req.params.id);
    if (!job) {
      res.status(404).json({ success: false, message: "Job not found" });
      return;
    }
    if (!isOwnedBy(job.owner, req.user)) {
      res.status(403).json({ success: false, message: "Not authorized" });
      return;
    }

    const technicianName =
      typeof req.body.technicianName === "string"
        ? req.body.technicianName.trim()
        : "";
    const actorId = String(req.user!._id);
    const technicianIdRaw =
      req.body.technicianId != null && req.body.technicianId !== ""
        ? String(req.body.technicianId)
        : technicianName
          ? ""
          : actorId;

    if (technicianIdRaw) {
      job.assignedTechnician =
        technicianIdRaw as unknown as typeof job.assignedTechnician;
    }
    if (technicianName) {
      job.assignedTechnicianName = technicianName;
      // Clear user link when assigning by free-text name only
      if (!technicianIdRaw) {
        job.assignedTechnician = undefined;
      }
    }
    job.assignedAt = new Date();
    if (job.status === "pending") {
      job.status = "assigned";
      job.timeline.push({
        status: "assigned",
        note:
          req.body.note ||
          (technicianName
            ? `Assigned to ${technicianName}`
            : "Technician assigned"),
        changedBy: actorId as unknown as typeof job.owner,
        at: new Date(),
      });
    } else if (technicianName || technicianIdRaw) {
      job.timeline.push({
        status: job.status,
        note: technicianName
          ? `Reassigned to ${technicianName}`
          : "Technician reassigned",
        changedBy: actorId as unknown as typeof job.owner,
        at: new Date(),
      });
    }

    await job.save();

    await createNotification({
      userId: job.owner,
      type: "job_assigned",
      title: "Job assigned",
      body: technicianName
        ? `Your job has been assigned to ${technicianName}.`
        : "Your job has been assigned.",
      data: {
        jobId: String(job._id),
        technicianId: technicianIdRaw || undefined,
        technicianName: technicianName || undefined,
      },
    });

    const populated = await Job.findById(job._id)
      .populate("property", "name address city")
      .populate("assignedTechnician", "fullName email phone")
      .lean();

    res.status(200).json({
      success: true,
      message: "Job assigned",
      data: { job: populated },
    });
  } catch (error) {
    next(error);
  }
};

export const parseQuickEntry = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const text = String(req.body.text || req.query.text || "");
    const result = parseJobQuickEntry(text);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
