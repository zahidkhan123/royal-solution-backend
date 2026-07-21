import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  listJobs,
  getJob,
  createJob,
  updateJob,
  updateJobStatus,
  assignJob,
  parseQuickEntry,
} from "../controllers/job.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listJobs);
router.post("/", createJob);
router.post("/parse-quick-entry", parseQuickEntry);
router.get("/:id", getJob);
router.patch("/:id", updateJob);
router.patch("/:id/status", updateJobStatus);
router.post("/:id/assign", assignJob);

export default router;
