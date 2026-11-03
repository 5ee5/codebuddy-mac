import { describe, expect, it, vi } from "vitest";
import { getSignupCode, getSupabaseSecretKey, SIGNUP_CODE_MIN_LENGTH } from "@/lib/auth/config";

describe("getSupabaseSecretKey", () => {
  it("returns the trimmed secret key", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", " sb_secret_abc ");
    expect(getSupabaseSecretKey()).toBe("sb_secret_abc");
  });

  it("treats a missing key as not set up", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(getSupabaseSecretKey()).toBeNull();
  });

  it("refuses the publishable key pasted in by mistake", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_publishable_abc");
    expect(getSupabaseSecretKey()).toBeNull();
  });
});

describe("getSignupCode", () => {
  it("returns the trimmed code", () => {
    vi.stubEnv("CODEBUDDY_SIGNUP_CODE", " loops-2026 ");
    expect(getSignupCode()).toBe("loops-2026");
  });

  it("keeps sign-up closed when the code is missing or too short to be safe", () => {
    vi.stubEnv("CODEBUDDY_SIGNUP_CODE", "");
    expect(getSignupCode()).toBeNull();
    vi.stubEnv("CODEBUDDY_SIGNUP_CODE", "x".repeat(SIGNUP_CODE_MIN_LENGTH - 1));
    expect(getSignupCode()).toBeNull();
  });
});
