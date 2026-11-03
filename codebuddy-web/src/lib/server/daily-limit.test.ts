import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DAILY_REQUEST_LIMIT, waitText } from "@/lib/server/daily-limit";

const MIGRATION = readFileSync(
  new URL("../../../supabase/migrations/20261026130000_ai_requests_and_practice_progress.sql", import.meta.url),
  "utf8",
);

describe("DAILY_REQUEST_LIMIT", () => {
  it("matches the limit the database enforces", () => {
    expect(MIGRATION).toContain(`daily_limit constant integer := ${DAILY_REQUEST_LIMIT};`);
  });
});

describe("waitText", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const after = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it.each([
    [0.2, "in about a minute"],
    [1, "in about a minute"],
    [25, "in about 25 minutes"],
    [59, "in about 59 minutes"],
    [60, "in about an hour"],
    [89, "in about an hour"],
    [180, "in about 3 hours"],
    [23 * 60 + 50, "in about 24 hours"],
  ])("%s minutes → %s", (minutes, text) => {
    expect(waitText(after(minutes), now)).toBe(text);
  });

  it("never says a time in the past", () => {
    expect(waitText(after(-5), now)).toBe("in about a minute");
  });

  it("falls back when the time is unknown", () => {
    expect(waitText(null, now)).toBe("later");
  });
});
