import { describe, expect, it } from "vitest";
import { isProtectedPath, loginPathFor, safeNextPath } from "@/lib/auth/paths";

describe("isProtectedPath", () => {
  it.each(["/learn", "/debug", "/account", "/history", "/history/some-id", "/learn/anything"])("protects %s", (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(["/", "/practice", "/login", "/learning", "/historyx", "/api/learn"])("leaves %s open", (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeNextPath("/debug?x=1")).toBe("/debug?x=1");
  });

  it.each([
    ["another website", "https://evil.example"],
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash trick", "/\\evil.example"],
    ["a relative path", "debug"],
    ["nothing", null],
  ])("falls back to the home page for %s", (_label, value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});

describe("loginPathFor", () => {
  it("remembers where to come back to", () => {
    expect(loginPathFor("/learn")).toBe("/login?next=%2Flearn");
  });

  it("leaves out the home page and unsafe targets", () => {
    expect(loginPathFor("/")).toBe("/login");
    expect(loginPathFor("//evil.example")).toBe("/login");
  });
});
