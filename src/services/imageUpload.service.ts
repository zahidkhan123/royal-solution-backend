import { PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import {
  AWS_REGION,
  s3Client,
  S3_BUCKET_NAME,
  s3CredentialsConfigured,
  s3CredentialDebug,
} from "../config/s3.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIMES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export interface UploadImageResult {
  key: string;
  url: string;
}

export class ImageValidationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/**
 * Validate image file: must exist, max 10MB, allowed types only.
 */
export function validateImage(file: Express.Multer.File | undefined): void {
  if (!file || !file.buffer) {
    throw new ImageValidationError("No image file provided");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ImageValidationError(
      "Image size exceeds 10MB limit"
    );
  }
  if (!ALLOWED_MIMES.includes(file.mimetype as any)) {
    throw new ImageValidationError(
      "Invalid image type. Allowed: jpg, jpeg, png, gif, webp"
    );
  }
}

/**
 * Upload image buffer to S3 and return public key and URL.
 */
export async function uploadImageToS3(
  file: Express.Multer.File
): Promise<UploadImageResult> {
  if (!s3CredentialsConfigured) {
    throw new ImageValidationError(
      "S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and S3_BUCKET_NAME in backend/.env (placeholders like your-access-key will not work).",
      503
    );
  }

  const ext = EXT_BY_MIME[file.mimetype] || "jpg";
  const key = `images/${uuidv4()}.${ext}`;

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: "inline",
      })
    );
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "name" in err
        ? String((err as { name?: string }).name)
        : "";
    const msg =
      err instanceof Error ? err.message : "Failed to upload image to S3";
    if (code === "InvalidAccessKeyId" || msg.includes("InvalidAccessKeyId")) {
      throw new ImageValidationError(
        "AWS rejected the access key. Check AWS_ACCESS_KEY_ID in backend/.env (must be a real IAM key, not your-access-key). Restart the server after changing .env.",
        503
      );
    }
    if (
      code === "SignatureDoesNotMatch" ||
      msg.includes("SignatureDoesNotMatch")
    ) {
      console.error("[S3] SignatureDoesNotMatch", s3CredentialDebug);
      throw new ImageValidationError(
        `AWS rejected the secret key (SignatureDoesNotMatch). Railway AWS_SECRET_ACCESS_KEY length is ${s3CredentialDebug.secretLength} (expected 40). Paste the full key in Railway Variables WITHOUT quotes (it must include + and /), then redeploy.`,
        503
      );
    }
    if (code === "NoSuchBucket" || msg.includes("NoSuchBucket")) {
      throw new ImageValidationError(
        `S3 bucket not found: ${S3_BUCKET_NAME}. Check S3_BUCKET_NAME / region.`,
        503
      );
    }
    throw new ImageValidationError(msg, 502);
  }

  const region = AWS_REGION || "us-east-1";
  const url =
    region === "us-east-1"
      ? `https://${S3_BUCKET_NAME}.s3.amazonaws.com/${key}`
      : `https://${S3_BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

  return { key, url };
}
