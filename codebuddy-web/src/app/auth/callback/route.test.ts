import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, getSupabase } = vi.hoisted(() => {
  const exchangeCodeForSession = vi.fn();
  return { exchangeCodeForSession, getSupabase: vi.fn() };
});
vi.mock("@/lib/auth/server", () => ({ getSupabase }));

import { GET } from "@/app/auth/callback/route";

/** As the live server sees it: its own address in the URL, the public one in the headers. */
function callback(query: string): Promise<Response> {
  return GET(
    new NextRequest(`http://localhost:3100/auth/callback?${query}`, {
      headers: { host: "codebuddy.example", "x-forwarded-proto": "https" },
    }),
  );
}

function location(res: Response): string {
  const url = new URL(res.headers.get("location")!);
  return `${url.pathname}${url.search}`;
}

beforeEach(() => {
  exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  getSupabase.mockReset().mockResolvedValue({ auth: { exchangeCodeForSession } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /auth/callback", () => {
  it("swaps the code for a session and continues to the requested page", async () => {
    const res = await callback("code=abc&next=%2Flearn");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://codebuddy.example/learn");
  });

  it("never continues to another website", async () => {
    expect(location(await callback("code=abc&next=%2F%2Fevil.example"))).toBe("/");
  });

  it("explains that an unknown GitHub account needs the class code first", async () => {
    const res = await callback("error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed");
    expect(location(res)).toBe("/login?error=github_not_connected");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("reports a GitHub account already connected to someone else on the Account page", async () => {
    const res = await callback("next=%2Faccount%3Fgithub%3Dconnected&error=server_error&error_code=identity_already_exists");
    expect(location(res)).toBe("/account?github=taken");
  });

  it.each([
    ["a missing code", "next=%2F", "/login?error=github_failed"],
    ["a missing code while connecting", "next=%2Faccount%3Fgithub%3Dconnected", "/account?github=failed"],
  ])("handles %s", async (_label, query, target) => {
    expect(location(await callback(query))).toBe(target);
  });

  it("fails safely when the code can't be swapped", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { code: "flow_state_expired", status: 400 } });
    expect(location(await callback("code=old"))).toBe("/login?error=github_failed");
  });

  it("never shows Supabase's own error text", async () => {
    const res = await callback("error=x&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    expect(res.headers.get("location")).not.toMatch(/script|alert/);
  });
});
