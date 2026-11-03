import { beforeEach, describe, expect, it, vi } from "vitest";

/* Sign-up with Supabase, request headers and Next's redirect faked. */
const mocks = vi.hoisted(() => ({
  canManageAccounts: vi.fn(),
  createUserAccount: vi.fn(),
  emailEnabled: vi.fn(),
  sendConfirmationEmail: vi.fn(),
  getSignupCode: vi.fn(),
  signInWithPassword: vi.fn(),
  headers: new Map<string, string>(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => mocks.headers.get(name) ?? null }),
  cookies: async () => ({ getAll: () => [], delete: vi.fn() }),
}));
vi.mock("@/lib/auth/admin", () => ({
  canManageAccounts: mocks.canManageAccounts,
  createUserAccount: mocks.createUserAccount,
}));
vi.mock("@/lib/auth/email-links", () => ({
  emailEnabled: mocks.emailEnabled,
  sendConfirmationEmail: mocks.sendConfirmationEmail,
}));
vi.mock("@/lib/auth/config", () => ({
  getSignupCode: mocks.getSignupCode,
  getSupabaseConfig: () => ({ url: "https://project.supabase.co", publishableKey: "sb_publishable_test" }),
}));
vi.mock("@/lib/auth/server", () => ({
  createSupabaseClient: async () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
  getSignedInUser: vi.fn(),
}));

import { signUp } from "@/lib/auth/actions";
import { FAILED_CODE_LIMIT, resetSignupLimitsForTests } from "@/lib/auth/signup";

const CODE = "loops-2026";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
const valid = (overrides: Record<string, string> = {}) =>
  form({ email: "ada@example.com", password: "a long password", confirm: "a long password", classCode: CODE, ...overrides });

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetSignupLimitsForTests();
  mocks.canManageAccounts.mockReset().mockReturnValue(true);
  mocks.createUserAccount.mockReset().mockResolvedValue("ok");
  mocks.emailEnabled.mockReset().mockReturnValue(false);
  mocks.sendConfirmationEmail.mockReset().mockResolvedValue("sent");
  mocks.getSignupCode.mockReset().mockReturnValue(CODE);
  mocks.signInWithPassword.mockReset().mockResolvedValue({ error: null });
  mocks.headers.clear();
  mocks.headers.set("cf-connecting-ip", "203.0.113.7");
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("signUp", () => {
  it("checks every field before anything else", async () => {
    const state = await signUp({}, form({ email: "nope", password: "short", confirm: "short" }));
    expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(["classCode", "email", "password"]);
    expect(mocks.createUserAccount).not.toHaveBeenCalled();
  });

  it("says sign-up is closed when no class code is set", async () => {
    mocks.getSignupCode.mockReturnValue(null);
    expect((await signUp({}, valid())).message).toMatch(/isn’t open/);
    expect(mocks.createUserAccount).not.toHaveBeenCalled();
  });

  it("says sign-up is closed when accounts can't be created", async () => {
    mocks.canManageAccounts.mockReturnValue(false);
    expect((await signUp({}, valid())).message).toMatch(/isn’t open/);
  });

  it("rejects a wrong class code and keeps the email", async () => {
    const state = await signUp({}, valid({ classCode: "guess-1234" }));
    expect(state.fieldErrors?.classCode).toMatch(/isn’t right/);
    expect(state.email).toBe("ada@example.com");
    expect(mocks.createUserAccount).not.toHaveBeenCalled();
  });

  it(`blocks an address after ${FAILED_CODE_LIMIT} wrong codes, even with the right one`, async () => {
    for (let i = 0; i < FAILED_CODE_LIMIT; i++) await signUp({}, valid({ classCode: `guess-${i}-xyz` }));
    expect((await signUp({}, valid())).message).toMatch(/Too many wrong class codes/);
    expect(mocks.createUserAccount).not.toHaveBeenCalled();
    // A different network is not affected.
    mocks.headers.set("cf-connecting-ip", "198.51.100.1");
    await expect(signUp({}, valid())).rejects.toThrow("REDIRECT /");
  });

  it("without email set up, creates a confirmed account, signs in and goes to the requested page", async () => {
    await expect(signUp({}, valid({ next: "/learn" }))).rejects.toThrow("REDIRECT /learn");
    expect(mocks.createUserAccount).toHaveBeenCalledWith("ada@example.com", "a long password", { confirmed: true });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "ada@example.com", password: "a long password" });
  });

  it("never redirects to another website", async () => {
    await expect(signUp({}, valid({ next: "//evil.example" }))).rejects.toThrow(/^REDIRECT \/$/);
  });

  it("points to sign-in when the email already has an account", async () => {
    mocks.createUserAccount.mockResolvedValue("exists");
    expect((await signUp({}, valid())).fieldErrors?.email).toMatch(/already an account/);
  });

  it("asks for a stronger password when Supabase rejects it", async () => {
    mocks.createUserAccount.mockResolvedValue("weak_password");
    expect((await signUp({}, valid())).fieldErrors?.password).toMatch(/too easy to guess/);
  });

  it("reports when the account couldn't be created", async () => {
    mocks.createUserAccount.mockResolvedValue("unavailable");
    expect((await signUp({}, valid())).message).toMatch(/couldn’t be created/);
  });

  it("sends the student to sign in by hand if signing in afterwards fails", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { code: "over_request_rate_limit", status: 429 } });
    await expect(signUp({}, valid({ next: "/debug" }))).rejects.toThrow("REDIRECT /login?next=%2Fdebug");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("a long password");
  });

  it("with email set up, creates an unconfirmed account and sends the link instead of signing in", async () => {
    mocks.emailEnabled.mockReturnValue(true);
    const state = await signUp({}, valid());
    expect(mocks.createUserAccount).toHaveBeenCalledWith("ada@example.com", "a long password", { confirmed: false });
    expect(mocks.sendConfirmationEmail).toHaveBeenCalledWith("ada@example.com");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(state).toMatchObject({ ok: true, unconfirmed: true, email: "ada@example.com" });
    expect(state.message).toMatch(/We sent a link to ada@example.com/);
  });

  it("offers to send the link again when the email couldn't be sent", async () => {
    mocks.emailEnabled.mockReturnValue(true);
    mocks.sendConfirmationEmail.mockResolvedValue("failed");
    const state = await signUp({}, valid());
    expect(state.ok).toBeUndefined();
    expect(state.unconfirmed).toBe(true);
    expect(state.message).toMatch(/couldn’t be sent/);
  });
});
