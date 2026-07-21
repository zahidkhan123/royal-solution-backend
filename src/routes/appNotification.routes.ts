import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/appNotification.controller.js";

const router = express.Router();

router.use(protect);
router.get("/", listNotifications);
router.post("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);

export default router;
