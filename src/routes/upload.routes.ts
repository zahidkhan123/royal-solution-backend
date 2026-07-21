import express from "express";
import { getPresignedUrl, deleteFile } from "../controllers/upload.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/presigned-url", protect, getPresignedUrl);
router.delete("/:key", protect, deleteFile);

export default router;

