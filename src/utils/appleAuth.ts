import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * Verifies a Sign in with Apple identity token:
 *  - signature against Apple's published public keys (JWKS)
 *  - issuer = https://appleid.apple.com
 *  - audience = our iOS bundle id(s) (APPLE_CLIENT_IDS, comma separated)
 *  - expiry
 * Throws if any check fails.
 */

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const DEFAULT_APPLE_CLIENT_IDS = "com.tradehelpdesk360";
const KEYS_TTL_MS = 60 * 60 * 1000;

type AppleJwk = crypto.JsonWebKey & { kid: string; alg?: string };

let cachedKeys: { keys: AppleJwk[]; fetchedAt: number } | null = null;

async function fetchAppleKeys(force = false): Promise<AppleJwk[]> {
  if (!force && cachedKeys && Date.now() - cachedKeys.fetchedAt < KEYS_TTL_MS) {
    return cachedKeys.keys;
  }
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) throw new Error(`Could not fetch Apple public keys (${res.status})`);
  const body = (await res.json()) as { keys?: AppleJwk[] };
  if (!body.keys?.length) throw new Error("Apple returned no public keys");
  cachedKeys = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

function appleAudiences(): [string, ...string[]] {
  const ids = (process.env.APPLE_CLIENT_IDS || DEFAULT_APPLE_CLIENT_IDS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) throw new Error("APPLE_CLIENT_IDS is empty");
  return ids as [string, ...string[]];
}

export type AppleIdentity = {
  /** Stable Apple user id — the same on every sign-in for this app. */
  sub: string;
  email?: string;
  emailVerified: boolean;
  isPrivateEmail: boolean;
};

export async function verifyAppleIdToken(idToken: string): Promise<AppleIdentity> {
  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded && typeof decoded === "object" ? decoded.header.kid : undefined;
  if (!kid) throw new Error("Invalid Apple ID token");

  let jwk = (await fetchAppleKeys()).find((k) => k.kid === kid);
  if (!jwk) {
    // Apple rotates keys; refresh once before giving up.
    jwk = (await fetchAppleKeys(true)).find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error("Apple signing key not found");

  const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const payload = jwt.verify(idToken, publicKey, {
    algorithms: ["RS256"],
    issuer: APPLE_ISSUER,
    audience: appleAudiences(),
  }) as jwt.JwtPayload & {
    email?: string;
    email_verified?: boolean | string;
    is_private_email?: boolean | string;
  };

  if (!payload.sub) throw new Error("Apple ID token has no subject");

  return {
    sub: payload.sub,
    email: payload.email ? String(payload.email).toLowerCase() : undefined,
    emailVerified: String(payload.email_verified) === "true",
    isPrivateEmail: String(payload.is_private_email) === "true",
  };
}
