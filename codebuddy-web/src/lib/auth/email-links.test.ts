import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateEmailToken: vi.fn(), sendEmail: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ generateEmailToken: mocks.generateEmailToken, canManageAccounts: () => true }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));

import { emailLink, sendConfirmationEmail, sendPasswordResetEmail } from "@/lib/auth/email-links";

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_key");
  vi.stubEnv("EMAIL_FROM", "CodeBuddy <noreply@codebuddy.example>");
  vi.stubEnv("CODEBUDDY_SITE_URL", "https://codebuddy.example");
  mocks.generateEmailToken.mockReset().mockResolvedValue({ token: "hash123" });
  mocks.sendEmail.mockReset().mockResolvedValue(true);
});

describe("emailLink", () => {
  it("points to the confirm page on the configured site, with no `next`", () => {
    expect(emailLink("https://codebuddy.example", "recovery", "hash123")).toBe(
      "https://codebuddy.example/auth/confirm?token_hash=hash123&type=recovery",
    );
  });
});

describe("sendConfirmationEmail", () => {
  it("makes a signup token and emails a confirmation link", async () => {
    expect(await sendConfirmationEmail("ada@example.com")).toBe("sent");
    expect(mocks.generateEmailToken).toHaveBeenCalledWith("signup", "ada@example.com");
    const [, to, message] = mocks.sendEmail.mock.calls[0];
    expect(to).toBe("ada@example.com");
    expect(message.text).toContain("https://codebuddy.example/auth/confirm?token_hash=hash123&type=email");
  });

  it.each(["not_found", "already_confirmed"])("sends nothing when the account is %s", async (result) => {
    mocks.generateEmailToken.mockResolvedValue(result);
    expect(await sendConfirmationEmail("ada@example.com")).toBe("nothing_to_send");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("reports a failed send", async () => {
    mocks.sendEmail.mockResolvedValue(false);
    expect(await sendConfirmationEmail("ada@example.com")).toBe("failed");
  });
});

describe("sendPasswordResetEmail", () => {
  it("makes a recovery token and emails a reset link", async () => {
    expect(await sendPasswordResetEmail("ada@example.com")).toBe("sent");
    expect(mocks.generateEmailToken).toHaveBeenCalledWith("recovery", "ada@example.com");
    expect(mocks.sendEmail.mock.calls[0][2].text).toContain("type=recovery");
  });

  it("sends nothing for an unknown email", async () => {
    mocks.generateEmailToken.mockResolvedValue("not_found");
    expect(await sendPasswordResetEmail("nobody@example.com")).toBe("nothing_to_send");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("never uses the request's address for links", async () => {
    vi.stubEnv("CODEBUDDY_SITE_URL", "");
    expect(await sendPasswordResetEmail("ada@example.com")).toBe("failed");
    expect(mocks.generateEmailToken).not.toHaveBeenCalled();
  });
});
