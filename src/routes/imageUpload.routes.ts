import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { uploadImage as multerUploadImage } from "../middleware/uploadImage.middleware.js";
import { validateBody } from "../middleware/validateBody.middleware.js";
import { imageUploadMetadataSchema } from "../validators/imageUpload.validator.js";
import { uploadImage } from "../controllers/imageUpload.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

function handleMulterError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        message: "Image size exceeds 10MB limit",
        success: false,
        statusCode: 400,
        errors: [],
      });
      return;
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      res.status(400).json({
        message: "Unexpected field. Use field name 'image' for the file.",
        success: false,
        statusCode: 400,
        errors: [],
      });
      return;
    }
  }
  next(err);
}

router.post(
  "/upload",
  protect,
  (req, res, next) => {
    multerUploadImage(req, res, (err: unknown) => {
      if (err) return handleMulterError(err, req, res, next);
      next();
    });
  },
  validateBody(imageUploadMetadataSchema),
  uploadImage
);

export default router;
