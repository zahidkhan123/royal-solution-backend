import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getUserDashboard,
  getAdminDashboard,
} from "../controllers/dashboard.controller.js";

const router = express.Router();

router.use(protect);
router.get("/user", getUserDashboard);
router.get("/admin", getAdminDashboard);

export default router;
