import { Response, NextFunction } from "express";
import { generatePresignedUrl, deleteFromS3 } from "../utils/awsS3.js";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest } from "../middleware/auth.middleware.js";

export const getPresignedUrl = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) {
      res.status(400).json({
        success: false,
        message: "Please provide fileName and contentType",
      });
      return;
    }

    // Generate unique key for the file
    const fileExtension = fileName.split(".").pop();
    const key = `uploads/${req.user!._id}/${uuidv4()}.${fileExtension}`;

    const presignedUrl = generatePresignedUrl(key, contentType);

    res.status(200).json({
      success: true,
      data: {
        presignedUrl,
        key,
        url: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteFile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { key } = req.params;

    const deleted = await deleteFromS3(key);

    if (!deleted) {
      res.status(500).json({
        success: false,
        message: "Failed to delete file",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

