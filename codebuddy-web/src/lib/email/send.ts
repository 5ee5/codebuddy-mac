import "server-only";
import type { EmailConfig } from "@/lib/email/config";
import type { EmailMessage } from "@/lib/email/templates";

/** Resend's API for sending one email. */
const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

/**
 * Sends one email through Resend. Returns whether Resend accepted it. Only
 * the HTTP status is logged: never the address, the link or the API key.
 */
export async function sendEmail(config: EmailConfig, to: string, message: EmailMessage): Promise<boolean> {
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) console.error("[email]", "send", res.status);
    return res.ok;
  } catch {
    console.error("[email]", "send", "network");
    return false;
  }
}
