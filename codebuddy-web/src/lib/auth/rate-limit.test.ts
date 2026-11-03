import { describe, expect, it } from "vitest";
import { createRateLimit } from "@/lib/auth/rate-limit";

describe("createRateLimit", () => {
  it("allows the limit per key within the window, then blocks until it passes", () => {
    const limit = createRateLimit(3, 1000);
    for (let i = 0; i < 3; i++) {
      expect(limit.reached("a", i)).toBe(false);
      limit.record("a", i);
    }
    expect(limit.reached("a", 10)).toBe(true);
    expect(limit.reached("b", 10)).toBe(false);
    expect(limit.reached("a", 1003)).toBe(false);
  });
});
