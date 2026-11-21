import mongoose from "mongoose";
import Project from "../models/Project.model.js";
import { isOwnedBy } from "../constants/maintenance.js";

export type ProjectLinkOk = {
  ok: true;
  cleared: boolean;
  projectId?: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  clientId?: mongoose.Types.ObjectId;
};

export type ProjectLinkResult =
  | ProjectLinkOk
  | { ok: false; status: number; message: string };

function isClear(value: unknown): boolean {
  return value === null || value === "";
}

/** Confirm a project belongs to this user and matches the site, if one is set. */
export async function resolveProjectAssignment(opts: {
  user: { _id?: unknown };
  projectId: unknown;
  propertyId?: unknown;
}): Promise<ProjectLinkResult> {
  if (isClear(opts.projectId)) {
    return { ok: true, cleared: true };
  }
  const id = String(opts.projectId || "");
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, message: "Invalid project" };
  }
  const project = await Project.findById(id);
  if (!project || !isOwnedBy(project.owner, opts.user)) {
    return { ok: false, status: 404, message: "Project not found" };
  }
  // Only enforce a site match when both sides have a site.
  if (
    opts.propertyId &&
    project.property &&
    String(opts.propertyId) !== String(project.property)
  ) {
    return {
      ok: false,
      status: 400,
      message: "That record belongs to a different site than the project",
    };
  }
  return {
    ok: true,
    cleared: false,
    projectId: project._id as mongoose.Types.ObjectId,
    propertyId: (project.property || undefined) as mongoose.Types.ObjectId | undefined,
    clientId: project.client as mongoose.Types.ObjectId | undefined,
  };
}

export async function resolveSectionId(
  projectId: mongoose.Types.ObjectId,
  sectionId: unknown
): Promise<
  | { ok: true; sectionId: mongoose.Types.ObjectId | null }
  | { ok: false; status: number; message: string }
> {
  if (sectionId === undefined || isClear(sectionId)) {
    return { ok: true, sectionId: null };
  }
  const id = String(sectionId);
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, message: "Invalid section" };
  }
  const project = await Project.findById(projectId).select("sections");
  const section = project?.sections.id(id);
  if (!section) {
    return {
      ok: false,
      status: 400,
      message: "Section not found on this project",
    };
  }
  return {
    ok: true,
    sectionId: section._id as mongoose.Types.ObjectId,
  };
}
