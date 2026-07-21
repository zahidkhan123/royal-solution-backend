import express from "express";
import {
  getAdminStats,
  getAdminAnalytics,
  listAdminUsers,
} from "../controllers/admin.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/stats", protect, authorize("admin"), getAdminStats);
router.get("/analytics", protect, authorize("admin"), getAdminAnalytics);
router.get("/users", protect, authorize("admin"), listAdminUsers);

export default router;
