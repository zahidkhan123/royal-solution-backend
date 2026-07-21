import { Response, NextFunction } from "express";
import { ValidatedRequest } from "../middleware/validateBody.middleware.js";
import { catchAsync } from "../utils/catchAsync.js";
import {
  validateImage,
  uploadImageToS3,
  ImageValidationError,
} from "../services/imageUpload.service.js";

interface ImageMetadata {
  name: string;
  description?: string;
  category?: string;
}

export const uploadImage = catchAsync(
  async (
    req: ValidatedRequest<ImageMetadata>,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    if (!req.file) {
      res.status(400).json({
        message: "No image file provided",
        success: false,
        statusCode: 400,
        errors: [],
      });
      return;
    }

    try {
      validateImage(req.file);
    } catch (err) {
      if (err instanceof ImageValidationError) {
        res.status(err.statusCode).json({
          message: err.message,
          success: false,
          statusCode: err.statusCode,
          errors: [],
        });
        return;
      }
      throw err;
    }

    const metadata = req.validatedBody;
    if (!metadata?.name) {
      res.status(400).json({
        message: "Validation error",
        success: false,
        statusCode: 400,
        errors: ["Name is required"],
      });
      return;
    }

    const { url, key } = await uploadImageToS3(req.file);

    res.status(201).json({
      message: "Image uploaded successfully",
      success: true,
      statusCode: 201,
      data: {
        image: {
          name: metadata.name,
          url,
          key,
          ...(metadata.description !== undefined && {
            description: metadata.description,
          }),
          ...(metadata.category !== undefined && { category: metadata.category }),
        },
      },
    });
  }
);
