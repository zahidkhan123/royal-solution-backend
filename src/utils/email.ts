import nodemailer, { TransportOptions } from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Resend (HTTPS API) - works on Railway and other hosts that block outbound SMTP
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_FETCH_TIMEOUT_MS = 10_000;

// SMTP (local dev only) - often blocked on cloud hosts (ports 587/465)
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.ZOHO_APP_PASS || process.env.SMTP_PASS;
const EMAIL_FROM =
  process.env.EMAIL_FROM ||
  process.env.SMTP_USER ||
  "SportX <onboarding@resend.dev>";

/** Send via Resend API (HTTPS). Fast, no SMTP ports required. */
async function sendViaResend(
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<boolean> {
  if (!RESEND_API_KEY) return false;

  // Resend: use verified subdomain emails.sportx360.com (root sportx360.com is not verified)
  const fromRaw = EMAIL_FROM.includes("<")
    ? EMAIL_FROM
    : EMAIL_FROM.includes("@")
      ? `SportX360 <${EMAIL_FROM}>`
      : "SportX360 <noreply@emails.sportx360.com>";
  // Rewrite root @sportx360.com to verified subdomain @emails.sportx360.com (avoid 403)
  const from = fromRaw.replace(/(?<!emails\.)@sportx360\.com(?=>|$|\s)/gi, "@emails.sportx360.com");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESEND_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
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

function getTransporter(): ReturnType<typeof nodemailer.createTransport> | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  const options = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 8000,
    socketTimeout: 8000,
  } as TransportOptions;
  return nodemailer.createTransport(options);
}

const OTP_SUBJECT = "Your SportX360 Verification Code";

function getOTPContent(otp: string) {
  const text = `Your SportX360 verification code is: ${otp}
  
Please enter this code to verify your email address. 

This code will expire in 5 minutes.

If you did not request this code, you can safely ignore this message.
`;

  // Use local asset path for the logo
  // Assume /assets/logo-mail.png is publicly available from backend static hosting
  const logoUrl = "https://sportxapi.playlio.co/assets/logo-mail.png";

  // Remove min-height: 100vh and extra bottom padding to eliminate scrolling whitespace
  const html = `
    <div style="background: #f4f8fb; padding: 48px 0 0 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 420px; margin: 0 auto; background: #fff; border-radius: 14px; box-shadow: 0 2px 16px rgba(13,13,58,0.09); font-family: 'Segoe UI', 'Roboto', Arial, Helvetica, sans-serif;">
        <tr>
          <td style="padding: 32px 36px 16px 36px; text-align: center;">
            <img src="${logoUrl}" alt="SportX360 Logo" style="height: 52px; margin-bottom: 22px;">
            <h2 style="color: #183153; letter-spacing: 0.5px; margin-bottom: 6px; font-size: 26px;">Verify Your Email Address</h2>
            <p style="color: #36415c; font-size: 16px; margin-bottom: 18px;">Enter the code below to verify your email for SportX360:</p>
            <!-- Center the OTP box with a table for better email compatibility -->
            <table width="100%" style="margin: 32px 0 32px 0; border-collapse: separate; border-spacing: 0;">
              <tr>
                <td align="center">
                  <span style="display: inline-block; background: #f3fcff; color: #00cfff; border-radius: 7px; font-size: 32px; font-weight: 700; letter-spacing: 10px; padding: 20px 32px; border: 1.5px solid #00cfff; box-shadow: 0 2px 8px 0 rgba(0,207,255,0.06); font-family: 'Roboto Mono', 'Menlo', Monaco, monospace;">
                    ${otp}
                  </span>
                </td>
              </tr>
            </table>
            <p style="color: #36384c; font-size: 15px; margin-bottom: 4px;">
              This code will expire in <b>5 minutes</b>.
            </p>
            <p style="color: #9dabc6; font-size: 12px; margin-top: 22px;">
              Didn’t request this code? You can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="text-align: center; padding: 30px 36px 18px 36px;">
            <div style="color: #bbbcca; border-top: 1px solid #f2f3f8; margin-top: 20px; padding-top: 16px; font-size: 12px;">
              &copy; ${new Date().getFullYear()} SportX360. All rights reserved.
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
  return { text, html };
}

/**
 * Send OTP email. Uses Resend when RESEND_API_KEY is set (recommended on Railway).
 * Otherwise uses SMTP for local dev. If neither is configured, logs OTP to console.
 */
export async function sendOTPEmail(to: string, otp: string): Promise<void> {
  const { text, html } = getOTPContent(otp);

  if (RESEND_API_KEY) {
    const sent = await sendViaResend(to, OTP_SUBJECT, text, html);
    if (sent) return;
    throw new Error("Failed to send OTP email via Resend. Check RESEND_API_KEY and logs.");
  }

  const transporter = getTransporter();
  if (!transporter) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[Email] OTP for ${to}: ${otp}`);
    }
    console.warn(
      "Email not configured. Set RESEND_API_KEY (recommended on Railway) or SMTP_* for local dev."
    );
    return;
  }

  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject: OTP_SUBJECT,
      text,
      html,
    });
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : "";
    if (code === "ETIMEDOUT" || code === "ECONNRESET") {
      throw new Error(
        "SMTP connection timeout. On Railway, set RESEND_API_KEY and use Resend (HTTPS) instead."
      );
    }
    throw err;
  }
}
