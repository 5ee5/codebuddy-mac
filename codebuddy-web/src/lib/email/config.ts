import "server-only";

/*
 * Settings for the emails CodeBuddy sends itself (sign-up confirmation and
 * password reset), through Resend. All three must be set, or email is off and
 * sign-up works without confirmation, as before.
 */
export interface EmailConfig {
  apiKey: string;
  /** Sender, e.g. `CodeBuddy <noreply@5ee5.dev>`; the domain must be verified in Resend. */
  from: string;
  /**
   * The public address links in emails point to. It's a fixed setting on
   * purpose: taking it from the request would let a forged Host header put an
   * attacker's site into someone's password-reset email.
   */
  siteUrl: string;
}

export function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const siteUrl = process.env.CODEBUDDY_SITE_URL?.trim().replace(/\/+$/, "");
  if (!apiKey || !from || !siteUrl || !/^https?:\/\/[^/\s]+$/.test(siteUrl)) return null;
  return { apiKey, from, siteUrl };
}
