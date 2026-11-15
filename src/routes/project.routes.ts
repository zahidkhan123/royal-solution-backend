import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  addMember,
  addSection,
  archiveProject,
  createProject,
  createReport,
  deleteProject,
  deleteReport,
  deleteSection,
  getProject,
  getReport,
  listProjects,
  listReports,
  removeMember,
  reorderSections,
  updateProject,
  updateReport,
  updateSection,
} from "../controllers/project.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listProjects);
router.post("/", createProject);
router.get("/:id", getProject);
router.patch("/:id", updateProject);
router.post("/:id/archive", archiveProject);
router.delete("/:id", deleteProject);

router.post("/:id/sections", addSection);
router.post("/:id/sections/reorder", reorderSections);
router.patch("/:id/sections/:sectionId", updateSection);
router.delete("/:id/sections/:sectionId", deleteSection);

router.post("/:id/members", addMember);
router.delete("/:id/members/:memberId", removeMember);

router.get("/:id/reports", listReports);
router.post("/:id/reports", createReport);
router.get("/:id/reports/:reportId", getReport);
router.patch("/:id/reports/:reportId", updateReport);
router.delete("/:id/reports/:reportId", deleteReport);

export default router;
