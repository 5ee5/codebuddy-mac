import { beforeEach, describe, expect, it, vi } from "vitest";

/* GitHub sign-in actions, with Supabase, request headers and Next's redirect faked. */
const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  linkIdentity: vi.fn(),
  getUserIdentities: vi.fn(),
  unlinkIdentity: vi.fn(),
  getSignedInUser: vi.fn(),
  refresh: vi.fn(),
  headers: new Map<string, string>(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => mocks.headers.get(name) ?? null }),
  cookies: async () => ({ getAll: () => [], delete: vi.fn() }),
}));
vi.mock("@/lib/auth/admin", () => ({}));
vi.mock("@/lib/auth/config", () => ({ getSupabaseConfig: () => null, getSignupCode: () => null }));
vi.mock("@/lib/auth/server", () => ({
  getSignedInUser: mocks.getSignedInUser,
  getSupabase: async () => ({
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
      linkIdentity: mocks.linkIdentity,
      getUserIdentities: mocks.getUserIdentities,
      unlinkIdentity: mocks.unlinkIdentity,
    },
  }),
  createSupabaseClient: vi.fn(),
}));

import { connectGitHub, disconnectGitHub, signInWithGitHub } from "@/lib/auth/actions";

const GITHUB_URL = "https://project.supabase.co/auth/v1/authorize?provider=github";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) if (typeof mock === "function") mock.mockReset();
  mocks.headers.clear();
  mocks.headers.set("host", "codebuddy.5ee5.dev");
  mocks.headers.set("x-forwarded-proto", "https");
  mocks.signInWithOAuth.mockResolvedValue({ data: { url: GITHUB_URL }, error: null });
  mocks.linkIdentity.mockResolvedValue({ data: { url: GITHUB_URL }, error: null });
  mocks.getSignedInUser.mockResolvedValue({ id: "user-1", email: "ada@example.com" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("signInWithGitHub", () => {
  it("sends the visitor to GitHub, coming back to this site's callback", async () => {
    await expect(signInWithGitHub(form({ next: "/debug" }))).rejects.toThrow(`REDIRECT ${GITHUB_URL}`);
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: { redirectTo: "https://codebuddy.5ee5.dev/auth/callback?next=%2Fdebug" },
    });
  });

  it("uses http for the local dev server", async () => {
    mocks.headers.set("host", "192.168.8.8:3001");
    mocks.headers.delete("x-forwarded-proto");
    await expect(signInWithGitHub(form({}))).rejects.toThrow("REDIRECT");
    expect(mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe("http://192.168.8.8:3001/auth/callback?next=%2F");
  });

  it("drops an unsafe next page", async () => {
    await expect(signInWithGitHub(form({ next: "https://evil.example" }))).rejects.toThrow("REDIRECT");
    expect(mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo).toMatch(/next=%2F$/);
  });

  it("returns to the login page when Supabase refuses", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { code: "validation_failed", status: 400 } });
    await expect(signInWithGitHub(form({}))).rejects.toThrow("REDIRECT /login?error=github_failed");
  });
});

describe("connectGitHub", () => {
  it("links GitHub to the signed-in account and comes back to Account", async () => {
    await expect(connectGitHub()).rejects.toThrow(`REDIRECT ${GITHUB_URL}`);
    expect(mocks.linkIdentity).toHaveBeenCalledWith({
      provider: "github",
      options: { redirectTo: "https://codebuddy.5ee5.dev/auth/callback?next=%2Faccount%3Fgithub%3Dconnected" },
    });
  });

  it("sends a signed-out visitor to sign in", async () => {
    mocks.getSignedInUser.mockResolvedValue(null);
    await expect(connectGitHub()).rejects.toThrow("REDIRECT /login?next=%2Faccount");
    expect(mocks.linkIdentity).not.toHaveBeenCalled();
  });

  it("reports when manual linking is switched off in Supabase", async () => {
    mocks.linkIdentity.mockResolvedValue({ data: { url: null }, error: { code: "manual_linking_disabled", status: 404 } });
    await expect(connectGitHub()).rejects.toThrow("REDIRECT /account?github=failed");
  });
});

describe("disconnectGitHub", () => {
  const email = { provider: "email", identity_id: "e" };
  const github = { provider: "github", identity_id: "g" };

  it("unlinks only the GitHub identity", async () => {
    mocks.getUserIdentities.mockResolvedValue({ data: { identities: [email, github] } });
    mocks.unlinkIdentity.mockResolvedValue({ error: null });
    await disconnectGitHub();
    expect(mocks.unlinkIdentity).toHaveBeenCalledWith(github);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("reports a failed disconnect", async () => {
    mocks.getUserIdentities.mockResolvedValue({ data: { identities: [email, github] } });
    mocks.unlinkIdentity.mockResolvedValue({ error: { code: "single_identity_not_deletable", status: 422 } });
    await expect(disconnectGitHub()).rejects.toThrow("REDIRECT /account?github=disconnect_failed");
  });

  it("does nothing when GitHub isn't connected", async () => {
    mocks.getUserIdentities.mockResolvedValue({ data: { identities: [email] } });
    await disconnectGitHub();
    expect(mocks.unlinkIdentity).not.toHaveBeenCalled();
  });
});
