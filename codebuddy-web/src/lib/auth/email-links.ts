import "server-only";
import { canManageAccounts, generateEmailToken } from "@/lib/auth/admin";
import { createRateLimit } from "@/lib/auth/rate-limit";
import { getEmailConfig } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/send";
import { confirmEmailMessage, resetPasswordMessage } from "@/lib/email/templates";

/*
 * Confirmation and password-reset emails. CodeBuddy makes the one-time token
 * with Supabase's admin API and emails a link to its own /auth/confirm page,
 * which asks for a click before using the token (mail scanners that open
 * links can't use it up).
 */

export type LinkType = "email" | "recovery";

/** Where each kind of link continues after it's used; fixed here, never taken from the link. */
export const LINK_NEXT: Record<LinkType, string> = { email: "/", recovery: "/reset-password" };

/** Emails asked for by hand (reset, "send it again") per network address per hour. */
export const EMAIL_REQUEST_LIMIT = 20;
export const emailRequests = createRateLimit(EMAIL_REQUEST_LIMIT, 60 * 60 * 1000);

/** Email features need Resend settings and the Supabase secret key. */
export function emailEnabled(): boolean {
  return getEmailConfig() !== null && canManageAccounts();
}

export function emailLink(siteUrl: string, type: LinkType, tokenHash: string): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type });
  return `${siteUrl}/auth/confirm?${params}`;
}

export type SendResult = "sent" | "nothing_to_send" | "failed";

/** Sends a confirmation link to an account that hasn't been confirmed yet. */
export async function sendConfirmationEmail(email: string): Promise<SendResult> {
  const config = getEmailConfig();
  if (!config) return "failed";
  const result = await generateEmailToken("signup", email);
  if (result === "not_found" || result === "already_confirmed") return "nothing_to_send";
  if (result === "unavailable") return "failed";
  const sent = await sendEmail(config, email, confirmEmailMessage(emailLink(config.siteUrl, "email", result.token)));
  return sent ? "sent" : "failed";
}

/** Sends a password-reset link, if there is an account with this email. */
export async function sendPasswordResetEmail(email: string): Promise<SendResult> {
  const config = getEmailConfig();
  if (!config) return "failed";
  const result = await generateEmailToken("recovery", email);
  if (result === "not_found" || result === "already_confirmed") return "nothing_to_send";
  if (result === "unavailable") return "failed";
  const sent = await sendEmail(config, email, resetPasswordMessage(emailLink(config.siteUrl, "recovery", result.token)));
  return sent ? "sent" : "failed";
}
