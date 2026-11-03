/*
 * The two emails CodeBuddy sends. Plain wording, one button, and the link
 * written out as text too, because some school mail clients strip buttons.
 */

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(heading: string, intro: string, button: string, link: string, footer: string): string {
  const href = escapeHtml(link);
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#fffdf8;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a1916;">
  <div style="max-width:480px;margin:0 auto;">
    <p style="font-weight:700;font-size:18px;margin:0 0 24px;">CodeBuddy</p>
    <h1 style="font-size:22px;margin:0 0 12px;">${escapeHtml(heading)}</h1>
    <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">${escapeHtml(intro)}</p>
    <p style="margin:0 0 24px;">
      <a href="${href}" style="display:inline-block;background:#1a1916;color:#fffdf8;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px;">${escapeHtml(button)}</a>
    </p>
    <p style="font-size:13px;line-height:1.5;color:#6b6760;margin:0 0 8px;">If the button doesn’t work, copy this address into your browser:</p>
    <p style="font-size:13px;line-height:1.5;word-break:break-all;margin:0 0 24px;"><a href="${href}" style="color:#1a1916;">${href}</a></p>
    <p style="font-size:13px;line-height:1.5;color:#6b6760;margin:0;">${escapeHtml(footer)}</p>
  </div>
</body>
</html>`;
}

export function confirmEmailMessage(link: string): EmailMessage {
  const heading = "Confirm your email";
  const intro = "You’re almost done creating your CodeBuddy account. Open this link to confirm your email address.";
  const footer = "The link works once. If you didn’t sign up for CodeBuddy, you can ignore this email.";
  return {
    subject: "Confirm your CodeBuddy account",
    text: `${heading}\n\n${intro}\n\n${link}\n\n${footer}\n`,
    html: layout(heading, intro, "Confirm my email", link, footer),
  };
}

export function resetPasswordMessage(link: string): EmailMessage {
  const heading = "Choose a new password";
  const intro = "Someone asked to reset the password for your CodeBuddy account. Open this link to choose a new one.";
  const footer = "The link works once and expires soon. If you didn’t ask for this, ignore this email; your password stays the same.";
  return {
    subject: "Reset your CodeBuddy password",
    text: `${heading}\n\n${intro}\n\n${link}\n\n${footer}\n`,
    html: layout(heading, intro, "Choose a new password", link, footer),
  };
}
