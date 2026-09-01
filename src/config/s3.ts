import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Always load backend/.env (not cwd-dependent when started from monorepo root)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function stripQuotes(v: string): string {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function env(...keys: string[]): string {
  for (const k of keys) {
    const raw = process.env[k];
    if (raw == null) continue;
    const v = stripQuotes(raw);
    if (v) return v;
  }
  return "";
}

/**
 * IAM secrets never contain spaces. Hosts often:
 * - wrap the value in quotes (Railway / copied .env)
 * - URL-decode '+' to space, or leave it as %2B
 */
function normalizeSecret(secret: string): string {
  let v = stripQuotes(secret);
  if (/%[0-9A-Fa-f]{2}/.test(v)) {
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep original */
    }
  }
  if (v.includes(" ")) v = v.replace(/ /g, "+");
  return v;
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

/** Prefer standard AWS_* names; fall back to legacy / pasted aliases. */
let accessKeyId = env("AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY", "AccessKey");
let secretAccessKey = normalizeSecret(
  env("AWS_SECRET_ACCESS_KEY", "S3_SECRET_KEY", "Secretaccesskey")
);
const region = env("AWS_REGION", "S3_REGION") || "us-east-1";
const bucket = env("S3_BUCKET_NAME", "S3_BUCKET");

// Prefer a complete ~40-char secret if the primary value was truncated at '+'
const aliasSecret = normalizeSecret(env("Secretaccesskey", "S3_SECRET_KEY"));
if (secretAccessKey.length < 40 && aliasSecret.length > secretAccessKey.length) {
  console.warn(
    `[S3] AWS_SECRET_ACCESS_KEY looks truncated (len=${secretAccessKey.length}, expected ~40). Using a longer alias from env.`
  );
  secretAccessKey = aliasSecret;
}

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

export const s3CredentialDebug = {
  configured: s3CredentialsConfigured,
  region,
  bucket,
  accessKeyPrefix: accessKeyId.slice(0, 4),
  secretLength: secretAccessKey.length,
  secretHasPlus: secretAccessKey.includes("+"),
  secretHasSlash: secretAccessKey.includes("/"),
};

if (s3CredentialsConfigured && secretAccessKey.length !== 40) {
  console.warn(
    `[S3] Secret key length is ${secretAccessKey.length} (IAM secrets are usually 40 chars). A truncated or URL-decoded '+' is a common cause of SignatureDoesNotMatch.`
  );
}

export const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  // Avoid SDK-default checksum headers that some S3 setups reject as SignatureDoesNotMatch
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
