import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Always load backend/.env (not cwd-dependent when started from monorepo root)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function env(...keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return "";
}

const PLACEHOLDERS = new Set([
  "",
  "your-access-key",
  "your-secret-key",
  "your-bucket-name",
  "your-region",
]);

function isPlaceholder(v: string): boolean {
  return PLACEHOLDERS.has(v) || v.startsWith("your-");
}

/** Prefer standard AWS_* names; fall back to legacy S3_* names used in this project. */
let accessKeyId = env("AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY");
let secretAccessKey = env("AWS_SECRET_ACCESS_KEY", "S3_SECRET_KEY");
const region = env("AWS_REGION", "S3_REGION") || "us-east-1";
const bucket = env("S3_BUCKET_NAME", "S3_BUCKET");

// Common mix-up: access keys start with AKIA/ASIA; secrets are longer (~40 chars)
const accessLooksLikeKey =
  accessKeyId.startsWith("AKIA") || accessKeyId.startsWith("ASIA");
const secretLooksLikeKey =
  secretAccessKey.startsWith("AKIA") || secretAccessKey.startsWith("ASIA");
if (!accessLooksLikeKey && secretLooksLikeKey) {
  const tmp = accessKeyId;
  accessKeyId = secretAccessKey;
  secretAccessKey = tmp;
  console.warn(
    "[S3] Detected swapped access/secret keys in env — corrected at runtime. Fix .env so AWS_ACCESS_KEY_ID starts with AKIA."
  );
}

export const S3_BUCKET_NAME = bucket;
export const AWS_REGION = region;

export const s3CredentialsConfigured =
  !isPlaceholder(accessKeyId) &&
  !isPlaceholder(secretAccessKey) &&
  !isPlaceholder(bucket);

if (!s3CredentialsConfigured) {
  console.warn(
    "[S3] Credentials incomplete or still placeholders. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME in backend/.env (or legacy S3_ACCESS_KEY / S3_SECRET_KEY / S3_REGION / S3_BUCKET)."
  );
} else {
  console.log(
    `[S3] Configured bucket=${bucket} region=${region} accessKeyId=${accessKeyId.slice(0, 4)}…`
  );
}

export const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});
