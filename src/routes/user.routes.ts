import express from "express";
import { AuthMiddleware } from "../middleware/auth.middleware.js";
import {
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  blockUser,
  unblockUser,
} from "../controllers/user.controller.js";

const router = express.Router();

// User routes - all require user role
router.get("/profile", AuthMiddleware(), getUserProfile);
router.put("/profile", AuthMiddleware(), updateUserProfile);
router.delete("/profile", AuthMiddleware(), deleteUserAccount);
router.post("/profile/block", AuthMiddleware(), blockUser);
router.post("/profile/unblock", AuthMiddleware(), unblockUser);

export default router;

