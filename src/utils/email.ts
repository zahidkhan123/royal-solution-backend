import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer, { TransportOptions } from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_FETCH_TIMEOUT_MS = 10_000;
const APP_NAME = "Trade Help Desk";

type MailConfig = {
  resendKey?: string;
  host?: string;
  port: number;
  user?: string;
  pass?: string;
  fromRaw: string;
};

/** First real value in backend/.env wins, so a later placeholder block cannot override Zoho. */
function readMailConfig(): MailConfig {
  const fromFile = new Map<string, string[]>();
  const envPath = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"),
    path.resolve(process.cwd(), ".env"),
  ].find((candidate) => fs.existsSync(candidate));

  if (envPath) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      const list = fromFile.get(key) ?? [];
      list.push(value);
      fromFile.set(key, list);
    }
  }

  const pick = (key: string): string | undefined => {
    const fromProcess = process.env[key]?.trim();
    const candidates = [...(fromFile.get(key) ?? [])];
    if (fromProcess) candidates.push(fromProcess);
    return candidates.find((value) => !isPlaceholder(value))?.trim();
  };

  const pass = pick("ZOHO_APP_PASS") || pick("SMTP_PASS");
  return {
    resendKey: pick("RESEND_API_KEY"),
    host: pick("SMTP_HOST"),
    port: parseInt(pick("SMTP_PORT") ?? "587", 10),
    user: pick("SMTP_USER"),
    pass,
    fromRaw: pick("EMAIL_FROM") || "",
  };
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return (
    v.length === 0 ||
    v.startsWith("your-") ||
    v.startsWith("your_") ||
    v.includes("example.com") ||
    v.includes("change-this")
  );
}

/** Visible From header. A bare address gets the app display name. */
function formatFromAddress(raw: string, fallbackUser?: string): string {
  const value = raw.trim();
  if (value.includes("<") && value.includes(">")) return value;
  if (value.includes("@")) return `${APP_NAME} <${value}>`;
  if (fallbackUser) return `${APP_NAME} <${fallbackUser}>`;
  return `${APP_NAME} <noreply@tradesmanhelpdesk.com>`;
}

function smtpConfigured(config: MailConfig): boolean {
  return (
    !isPlaceholder(config.host) &&
    !isPlaceholder(config.user) &&
    !isPlaceholder(config.pass)
  );
}

/** Send via Resend API (HTTPS). Fast, no SMTP ports required. */
async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<boolean> {
  if (!apiKey || isPlaceholder(apiKey)) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESEND_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await res.text();
      console.error("Resend API error:", res.status, body);
      return false;
    }
    return true;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("Resend API timeout after", RESEND_FETCH_TIMEOUT_MS, "ms");
    } else {
      console.error("Resend API request failed:", message);
    }
    return false;
  }
}

function getTransporter(
  config: MailConfig
): ReturnType<typeof nodemailer.createTransport> | null {
  if (!smtpConfigured(config) || !config.host || !config.user || !config.pass) {
    return null;
  }

  const options = {
    host: config.host,
    port: config.port,
    secure: false,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 8000,
    socketTimeout: 8000,
  } as TransportOptions;
  return nodemailer.createTransport(options);
}

const OTP_SUBJECT = `Your ${APP_NAME} verification code`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getOTPContent(otp: string) {
  const safeOtp = escapeHtml(otp);
  const year = new Date().getFullYear();
  const text = `Your ${APP_NAME} verification code is: ${otp}

Enter this code to verify your email address.

This code will expire in 5 minutes.

If you did not request this code, you can ignore this message.
`;

  const html = `
    <div style="background:#F8F9FB;padding:32px 12px;font-family:'Segoe UI',Roboto,Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E4E7EC;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:#1A1E28;padding:22px 28px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#FF9933;width:36px;height:36px;border-radius:10px;text-align:center;vertical-align:middle;color:#ffffff;font-weight:800;font-size:16px;">T</td>
                <td style="padding-left:12px;">
                  <div style="color:#ffffff;font-size:16px;font-weight:700;line-height:1.2;">${APP_NAME}</div>
                  <div style="color:#FFD9A8;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;margin-top:2px;">Verification</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px 8px 28px;text-align:center;">
            <h1 style="margin:0 0 8px 0;color:#1D2939;font-size:22px;font-weight:700;">Verify your email</h1>
            <p style="margin:0;color:#475467;font-size:15px;line-height:1.5;">Enter this code in ${APP_NAME} to confirm your email address.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
              <tr>
                <td align="center">
                  <span style="display:inline-block;background:#FFF8F0;color:#C96E12;border:1.5px solid #FF9933;border-radius:10px;font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 28px;font-family:'Roboto Mono',Menlo,Monaco,monospace;">${safeOtp}</span>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#344054;font-size:14px;">This code expires in <b>5 minutes</b>.</p>
            <p style="margin:18px 0 0 0;color:#98A2B3;font-size:12px;line-height:1.5;">If you did not request this code, you can ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 22px 28px;text-align:center;">
            <div style="border-top:1px solid #E4E7EC;padding-top:16px;color:#98A2B3;font-size:12px;">&copy; ${year} ${APP_NAME}. All rights reserved.</div>
          </td>
        </tr>
      </table>
    </div>
  `;
  return { text, html };
}

function smtpFailureText(err: unknown): { code: string; response: string } {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: string }).code || "")
      : "";
  const response =
    err && typeof err === "object" && "response" in err
      ? String((err as { response?: string }).response || "")
      : "";
  return { code, response };
}

function senderRejected(err: unknown): boolean {
  const { code, response } = smtpFailureText(err);
  return /sender|from|relay|alias|not owned|550|553|554/i.test(`${code} ${response}`);
}

/**
 * Send OTP email through Zoho SMTP when it is configured.
 * Login is SMTP_USER. The visible From is EMAIL_FROM when Zoho allows it.
 * Resend is used only when SMTP is not configured.
 */
export async function sendOTPEmail(to: string, otp: string): Promise<void> {
  const { text, html } = getOTPContent(otp);
  const config = readMailConfig();
  const from = formatFromAddress(config.fromRaw, config.user);

  const transporter = getTransporter(config);
  if (transporter && config.user) {
    const loginFrom = formatFromAddress(config.user);
    try {
      await transporter.sendMail({
        from,
        to,
        subject: OTP_SUBJECT,
        text,
        html,
      });
      console.log(`[Email] OTP sent via SMTP from ${from} to ${to}`);
      return;
    } catch (err: unknown) {
      const { code, response } = smtpFailureText(err);
      if (code === "ETIMEDOUT" || code === "ECONNRESET") {
        throw new Error(
          "SMTP connection timeout. On hosts that block SMTP, set RESEND_API_KEY and remove SMTP_HOST."
        );
      }
      if (senderRejected(err) && from !== loginFrom) {
        console.warn(
          `[Email] Zoho refused ${from}. Sending as ${loginFrom}. Add the noreply address as an alias of ${config.user} in Zoho Mail Admin to send as noreply.`
        );
        await transporter.sendMail({
          from: loginFrom,
          to,
          subject: OTP_SUBJECT,
          text,
          html,
        });
        console.log(`[Email] OTP sent via SMTP from ${loginFrom} to ${to}`);
        return;
      }
      if (senderRejected(err)) {
        throw new Error(
          `Zoho rejected the From address ${from}. ${response}`.trim()
        );
      }
      throw err;
    }
  }

  if (config.resendKey) {
    const sent = await sendViaResend(
      config.resendKey,
      from,
      to,
      OTP_SUBJECT,
      text,
      html
    );
    if (sent) return;
    throw new Error("Failed to send OTP email via Resend. Check RESEND_API_KEY and logs.");
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`[Email] OTP for ${to}: ${otp}`);
  }
  console.warn(
    "Email not configured. Set SMTP_HOST, SMTP_USER, ZOHO_APP_PASS, and EMAIL_FROM, or set RESEND_API_KEY."
  );
}
