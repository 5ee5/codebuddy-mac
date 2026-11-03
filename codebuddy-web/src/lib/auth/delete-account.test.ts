import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Account deletion is permanent, so the action is tested with every
 * dependency faked: Supabase, cookies and Next's redirect.
 */
const mocks = vi.hoisted(() => ({
  canManageAccounts: vi.fn(),
  verifyPassword: vi.fn(),
  deleteUserById: vi.fn(),
  getSignedInUser: vi.fn(),
  signOut: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [{ name: "sb-abc-auth-token.0" }, { name: "sb-abc-auth-token.1" }, { name: "theme" }],
    delete: mocks.cookieDelete,
  }),
}));
vi.mock("@/lib/auth/admin", () => ({
  canManageAccounts: mocks.canManageAccounts,
  verifyPassword: mocks.verifyPassword,
  deleteUserById: mocks.deleteUserById,
}));
vi.mock("@/lib/auth/server", () => ({
  getSignedInUser: mocks.getSignedInUser,
  createSupabaseClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("@/lib/auth/config", () => ({
  getSupabaseConfig: () => ({ url: "https://project.supabase.co", publishableKey: "sb_publishable_test" }),
}));

import { deleteAccount } from "@/lib/auth/actions";

const USER = { id: "00000000-0000-4000-8000-000000000001", email: "student@example.com" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
const valid = () => form({ password: "correct horse", understood: "on" });

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getSignedInUser.mockResolvedValue(USER);
  mocks.canManageAccounts.mockReturnValue(true);
  mocks.verifyPassword.mockResolvedValue("ok");
  mocks.deleteUserById.mockResolvedValue(true);
  mocks.signOut.mockResolvedValue({ error: null });
});

function expectNothingDeleted() {
  expect(mocks.deleteUserById).not.toHaveBeenCalled();
  expect(mocks.cookieDelete).not.toHaveBeenCalled();
}

describe("deleteAccount", () => {
  it("asks for the password and the ticked box first", async () => {
    const state = await deleteAccount({}, form({}));
    expect(state.fieldErrors).toEqual({
      password: "Enter your password to confirm it’s you.",
      understood: "Tick the box to confirm you understand.",
    });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expectNothingDeleted();
  });

  it("sends a signed-out visitor to sign in", async () => {
    mocks.getSignedInUser.mockResolvedValue(null);
    await expect(deleteAccount({}, valid())).rejects.toThrow("REDIRECT /login?next=%2Faccount");
    expectNothingDeleted();
  });

  it("explains when the server can't delete accounts", async () => {
    mocks.canManageAccounts.mockReturnValue(false);
    const state = await deleteAccount({}, valid());
    expect(state.message).toMatch(/isn’t set up/);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expectNothingDeleted();
  });

  it("checks the password of the signed-in user, not an email from the form", async () => {
    mocks.verifyPassword.mockResolvedValue("wrong");
    const state = await deleteAccount({}, form({ password: "guess", understood: "on", email: "other@example.com" }));
    expect(mocks.verifyPassword).toHaveBeenCalledWith(USER.email, "guess");
    expect(state.fieldErrors?.password).toBe("That password isn’t right.");
    expectNothingDeleted();
  });

  it.each([
    ["rate_limited", /Too many attempts/],
    ["unavailable", /Nothing was deleted/],
  ])("deletes nothing when the password check is %s", async (result, message) => {
    mocks.verifyPassword.mockResolvedValue(result);
    expect((await deleteAccount({}, valid())).message).toMatch(message);
    expectNothingDeleted();
  });

  it("keeps the session when Supabase fails to delete", async () => {
    mocks.deleteUserById.mockResolvedValue(false);
    const state = await deleteAccount({}, valid());
    expect(state.message).toMatch(/Nothing was removed/);
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("deletes the signed-in user, clears only the session cookies and says goodbye", async () => {
    await expect(deleteAccount({}, valid())).rejects.toThrow("REDIRECT /goodbye");
    expect(mocks.deleteUserById).toHaveBeenCalledWith(USER.id);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.cookieDelete.mock.calls.map(([name]) => name)).toEqual([
      "sb-abc-auth-token.0",
      "sb-abc-auth-token.1",
    ]);
  });

  it("still clears the cookies if signing out of the deleted account fails", async () => {
    mocks.signOut.mockRejectedValue(new Error("network"));
    await expect(deleteAccount({}, valid())).rejects.toThrow("REDIRECT /goodbye");
    expect(mocks.cookieDelete).toHaveBeenCalledTimes(2);
  });
});
