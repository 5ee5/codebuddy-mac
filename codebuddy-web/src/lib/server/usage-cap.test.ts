import { beforeEach, describe, expect, it } from "vitest";
import {
  acquireSlot,
  CONCURRENT_REQUEST_LIMIT,
  HOURLY_REQUEST_LIMIT,
  resetUsageForTests,
} from "@/lib/server/usage-cap";

describe("acquireSlot", () => {
  beforeEach(() => resetUsageForTests());

  it(`allows ${HOURLY_REQUEST_LIMIT} calls per hour, then refuses`, () => {
    const t0 = 1_000_000;
    for (let i = 0; i < HOURLY_REQUEST_LIMIT; i++) {
      const release = acquireSlot(t0 + i);
      expect(release).not.toBeNull();
      release!();
    }
    expect(acquireSlot(t0 + HOURLY_REQUEST_LIMIT)).toBeNull();
    // A new window opens after an hour.
    expect(acquireSlot(t0 + 60 * 60 * 1000)).not.toBeNull();
  });

  it(`allows at most ${CONCURRENT_REQUEST_LIMIT} calls at once`, () => {
    const held = Array.from({ length: CONCURRENT_REQUEST_LIMIT }, () => acquireSlot(1_000));
    expect(held.every(Boolean)).toBe(true);
    expect(acquireSlot(1_000)).toBeNull();
    held[0]!();
    // Releasing twice must not free an extra slot.
    held[0]!();
    expect(acquireSlot(1_000)).not.toBeNull();
    expect(acquireSlot(1_000)).toBeNull();
  });
});
