import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validateBody.middleware.js";
import { notificationPrefsBody } from "../validators/notification.validator.js";
import {
  getNotificationPrefsHandler,
  putNotificationPrefsHandler,
} from "../controllers/notificationPrefs.controller.js";

const router = express.Router();

router.get("/preferences", protect, getNotificationPrefsHandler);

router.put(
  "/preferences",
  protect,
  validateBody(notificationPrefsBody),
  putNotificationPrefsHandler
);

export default router;
