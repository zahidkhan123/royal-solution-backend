import AWS from "aws-sdk";
import {
  AWS_REGION,
  S3_BUCKET_NAME,
  s3CredentialsConfigured,
} from "../config/s3.js";

// Reuse the same resolved credentials as image upload (AWS_* with S3_* fallbacks)
const accessKeyId =
  process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || "";
const secretAccessKey =
  process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY || "";

const s3 = new AWS.S3({
  accessKeyId,
  secretAccessKey,
  region: AWS_REGION,
});

export const generatePresignedUrl = (
  key: string,
  contentType: string,
  expiresIn: number = 3600
): string => {
  if (!s3CredentialsConfigured) {
    throw new Error(
      "S3 is not configured. Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_BUCKET_NAME in backend/.env"
    );
  }
  return s3.getSignedUrl("putObject", {
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    Expires: expiresIn,
  });
};

export const deleteFromS3 = async (key: string): Promise<boolean> => {
  try {
    await s3
      .deleteObject({
        Bucket: S3_BUCKET_NAME,
        Key: key,
      })
      .promise();
    return true;
  } catch (error) {
    console.error("Error deleting from S3:", error);
    return false;
  }
};

export const getS3Url = (key: string): string => {
  return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

