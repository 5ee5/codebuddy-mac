import { describe, expect, it } from "vitest";
import { confirmEmailMessage, resetPasswordMessage } from "@/lib/email/templates";

const LINK = "https://codebuddy.example/auth/confirm?token_hash=abc123&type=email";

describe.each([
  ["confirmEmailMessage", confirmEmailMessage, /Confirm your CodeBuddy account/],
  ["resetPasswordMessage", resetPasswordMessage, /Reset your CodeBuddy password/],
])("%s", (_name, make, subject) => {
  const message = make(LINK);

  it("has a clear subject", () => {
    expect(message.subject).toMatch(subject);
  });

  it("puts the link in the plain-text version as is", () => {
    expect(message.text).toContain(LINK);
  });

  it("escapes the link in the HTML version, as a button and as text", () => {
    const escaped = LINK.replace(/&/g, "&amp;");
    expect(message.html.split(`href="${escaped}"`).length - 1).toBe(2);
    expect(message.html).not.toContain(`href="${LINK}"`);
  });

  it("can't be broken out of by a strange link", () => {
    const evil = make('https://x.example/"><script>alert(1)</script>');
    expect(evil.html).not.toContain("<script>");
  });
});
