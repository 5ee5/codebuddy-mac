import { beforeEach, describe, expect, it } from "vitest";
import {
  checkSignupCode,
  FAILED_CODE_LIMIT,
  NEW_ACCOUNT_LIMIT,
  newAccountLimitReached,
  recordFailedCode,
  recordNewAccount,
  resetSignupLimitsForTests,
  tooManyFailedCodes,
} from "@/lib/auth/signup";

const HOUR = 60 * 60 * 1000;

beforeEach(() => resetSignupLimitsForTests());

describe("checkSignupCode", () => {
  it("accepts the right code, ignoring surrounding spaces", () => {
    expect(checkSignupCode(" loops-2026 ", "loops-2026")).toBe(true);
  });

  it.each(["", "loops-2025", "LOOPS-2026", "loops-2026x"])("rejects %j", (input) => {
    expect(checkSignupCode(input, "loops-2026")).toBe(false);
  });
});

describe("wrong-code limit", () => {
  it(`allows ${FAILED_CODE_LIMIT} wrong codes per address per hour`, () => {
    for (let i = 0; i < FAILED_CODE_LIMIT; i++) {
      expect(tooManyFailedCodes("1.2.3.4", 1_000 + i)).toBe(false);
      recordFailedCode("1.2.3.4", 1_000 + i);
    }
    expect(tooManyFailedCodes("1.2.3.4", 2_000)).toBe(true);
    // Other addresses are unaffected, and the block lifts after an hour.
    expect(tooManyFailedCodes("5.6.7.8", 2_000)).toBe(false);
    expect(tooManyFailedCodes("1.2.3.4", 1_000 + HOUR + FAILED_CODE_LIMIT)).toBe(false);
  });
});

describe("new-account limit", () => {
  it(`allows ${NEW_ACCOUNT_LIMIT} new accounts per hour`, () => {
    for (let i = 0; i < NEW_ACCOUNT_LIMIT; i++) {
      expect(newAccountLimitReached(1_000 + i)).toBe(false);
      recordNewAccount(1_000 + i);
    }
    expect(newAccountLimitReached(2_000)).toBe(true);
    expect(newAccountLimitReached(1_000 + HOUR + NEW_ACCOUNT_LIMIT)).toBe(false);
  });
});
