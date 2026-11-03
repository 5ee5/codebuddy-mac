import { beforeEach, describe, expect, it, vi } from "vitest";

/* Email-related actions, with Supabase, the email module, headers and redirect faked. */
const mocks = vi.hoisted(() => ({
  emailEnabled: vi.fn(),
  sendConfirmationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  headers: new Map<string, string>(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => mocks.headers.get(name) ?? null }),
  cookies: async () => ({ getAll: () => [], delete: vi.fn() }),
}));
vi.mock("@/lib/auth/admin", () => ({}));
vi.mock("@/lib/auth/config", () => ({
  getSupabaseConfig: () => ({ url: "https://project.supabase.co", publishableKey: "sb_publishable_test" }),
  getSignupCode: () => null,
}));
vi.mock("@/lib/auth/server", () => ({
  getSupabase: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
  createSupabaseClient: async () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
  getSignedInUser: vi.fn(),
}));
vi.mock("@/lib/auth/email-links", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/email-links")>();
  return {
    ...real,
    emailEnabled: mocks.emailEnabled,
    sendConfirmationEmail: mocks.sendConfirmationEmail,
    sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  };
});

import { confirmEmailLink, requestPasswordReset, resendConfirmation, signIn } from "@/lib/auth/actions";
import { EMAIL_REQUEST_LIMIT, emailRequests } from "@/lib/auth/email-links";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  emailRequests.reset();
  mocks.emailEnabled.mockReset().mockReturnValue(true);
  mocks.sendConfirmationEmail.mockReset().mockResolvedValue("sent");
  mocks.sendPasswordResetEmail.mockReset().mockResolvedValue("sent");
  mocks.verifyOtp.mockReset().mockResolvedValue({ error: null });
  mocks.signInWithPassword.mockReset();
  mocks.headers.clear();
  mocks.headers.set("cf-connecting-ip", "203.0.113.7");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  ["requestPasswordReset", requestPasswordReset, () => mocks.sendPasswordResetEmail],
  ["resendConfirmation", resendConfirmation, () => mocks.sendConfirmationEmail],
])("%s", (_name, action, sender) => {
  it("checks the email address first", async () => {
    const state = await action({}, form({ email: "not-an-email" }));
    expect(state.fieldErrors?.email).toMatch(/valid email/);
    expect(sender()).not.toHaveBeenCalled();
  });

  it("gives the same reply whether or not there is an account", async () => {
    const sent = await action({}, form({ email: "ada@example.com" }));
    sender().mockResolvedValue("nothing_to_send");
    const nothing = await action({}, form({ email: "ada@example.com" }));
    expect(nothing).toEqual(sent);
    expect(sent.ok).toBe(true);
  });

  it("says so when the email couldn't be sent", async () => {
    sender().mockResolvedValue("failed");
    expect((await action({}, form({ email: "ada@example.com" }))).message).toMatch(/couldn’t be sent/);
  });

  it("says so when emails aren't set up", async () => {
    mocks.emailEnabled.mockReturnValue(false);
    expect((await action({}, form({ email: "ada@example.com" }))).message).toMatch(/aren’t set up/);
    expect(sender()).not.toHaveBeenCalled();
  });

  it(`limits a network address to ${EMAIL_REQUEST_LIMIT} requests an hour`, async () => {
    for (let i = 0; i < EMAIL_REQUEST_LIMIT; i++) await action({}, form({ email: `s${i}@example.com` }));
    expect((await action({}, form({ email: "ada@example.com" }))).message).toMatch(/Too many emails/);
    expect(sender()).toHaveBeenCalledTimes(EMAIL_REQUEST_LIMIT);
  });
});

describe("confirmEmailLink", () => {
  it.each([
    ["a confirmation link", "email", "/"],
    ["a reset link", "recovery", "/reset-password"],
  ])("uses %s and continues to the right page", async (_label, type, target) => {
    await expect(confirmEmailLink(form({ token_hash: "abc123def456", type }))).rejects.toThrow(`REDIRECT ${target}`);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type, token_hash: "abc123def456" });
  });

  it("ignores a `next` someone added to the link", async () => {
    await expect(
      confirmEmailLink(form({ token_hash: "abc123def456", type: "email", next: "https://evil.example" })),
    ).rejects.toThrow(/^REDIRECT \/$/);
  });

  it.each([
    ["an unknown type", { token_hash: "abc123def456", type: "magiclink" }],
    ["a malformed token", { token_hash: "abc<script>", type: "email" }],
    ["no token", { type: "email" }],
  ])("rejects %s without asking Supabase", async (_label, fields) => {
    await expect(confirmEmailLink(form(fields))).rejects.toThrow("REDIRECT /login?error=link_invalid");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("sends a used or expired link back to sign-in", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
    await expect(confirmEmailLink(form({ token_hash: "abc123def456", type: "recovery" }))).rejects.toThrow(
      "REDIRECT /login?error=link_invalid",
    );
  });
});

describe("signIn", () => {
  it("offers to resend the link when the email isn't confirmed yet", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { code: "email_not_confirmed", status: 400 } });
    const state = await signIn({}, form({ email: "ada@example.com", password: "a long password" }));
    expect(state).toMatchObject({ unconfirmed: true, email: "ada@example.com" });
    expect(state.message).toMatch(/Confirm your email first/);
  });
});
