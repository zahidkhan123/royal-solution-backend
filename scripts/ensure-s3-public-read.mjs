/**
 * Make objects under images/ and uploads/ publicly readable so app/admin
 * previews can load the S3 URL returned by /api/images/upload.
 *
 * ACLs are disabled on this bucket (BucketOwnerEnforced), so public-read
 * must be a bucket policy — not an object ACL.
 */
import dotenv from "dotenv";
import {
  S3Client,
  PutBucketPolicyCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";

dotenv.config({ path: new URL("../.env", import.meta.url) });

const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.replace(
  /^["']|["']$/g,
  ""
).trim();
const region = process.env.AWS_REGION?.trim() || "eu-north-1";
const bucket = process.env.S3_BUCKET_NAME?.trim();

if (!accessKeyId || !secretAccessKey || !bucket) {
  console.error("Missing AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_BUCKET_NAME");
  process.exit(1);
}

const client = new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey },
});

const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "AllowBackendUserAccess",
      Effect: "Allow",
      Principal: { AWS: "arn:aws:iam::477977196582:user/ZAHIDKHAN" },
      Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      Resource: `arn:aws:s3:::${bucket}/*`,
    },
    {
      Sid: "AllowBackendUserListBucket",
      Effect: "Allow",
      Principal: { AWS: "arn:aws:iam::477977196582:user/ZAHIDKHAN" },
      Action: "s3:ListBucket",
      Resource: `arn:aws:s3:::${bucket}`,
    },
    {
      Sid: "PublicReadImages",
      Effect: "Allow",
      Principal: "*",
      Action: "s3:GetObject",
      Resource: [
        `arn:aws:s3:::${bucket}/images/*`,
        `arn:aws:s3:::${bucket}/uploads/*`,
      ],
    },
  ],
};

await client.send(
  new PutBucketPolicyCommand({
    Bucket: bucket,
    Policy: JSON.stringify(policy),
  })
);
await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "HEAD"],
          AllowedOrigins: ["*"],
          ExposeHeaders: ["ETag", "Content-Type", "Content-Length"],
          MaxAgeSeconds: 3000,
        },
      ],
    },
  })
);

console.log(`Public read enabled on s3://${bucket}/images/* and uploads/*`);
