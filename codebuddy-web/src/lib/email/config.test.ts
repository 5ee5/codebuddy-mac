import { describe, expect, it, vi } from "vitest";
import { getEmailConfig } from "@/lib/email/config";

function stub(apiKey: string, from: string, siteUrl: string) {
  vi.stubEnv("RESEND_API_KEY", apiKey);
  vi.stubEnv("EMAIL_FROM", from);
  vi.stubEnv("CODEBUDDY_SITE_URL", siteUrl);
}

describe("getEmailConfig", () => {
  it("returns the settings, without a trailing slash on the site address", () => {
    stub(" re_key ", "CodeBuddy <noreply@5ee5.dev>", "https://codebuddy.5ee5.dev/");
    expect(getEmailConfig()).toEqual({
      apiKey: "re_key",
      from: "CodeBuddy <noreply@5ee5.dev>",
      siteUrl: "https://codebuddy.5ee5.dev",
    });
  });

  it.each([
    ["no API key", "", "x <a@b.c>", "https://a.example"],
    ["no sender", "re_key", "", "https://a.example"],
    ["no site address", "re_key", "x <a@b.c>", ""],
    ["a site address with a path", "re_key", "x <a@b.c>", "https://a.example/app"],
    ["a site address without a scheme", "re_key", "x <a@b.c>", "codebuddy.5ee5.dev"],
  ])("keeps email off with %s", (_label, apiKey, from, siteUrl) => {
    stub(apiKey, from, siteUrl);
    expect(getEmailConfig()).toBeNull();
  });
});
