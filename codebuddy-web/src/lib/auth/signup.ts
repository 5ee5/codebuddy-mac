import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getSignupCode } from "@/lib/auth/config";
import { canManageAccounts } from "@/lib/auth/admin";

/*
 * The class code and the limits around sign-up. The limits are kept in
 * memory per server process, like the AI usage cap, so they reset when the
 * server restarts.
 */

/** Wrong class codes allowed per network address per hour, against guessing. */
export const FAILED_CODE_LIMIT = 10;
/** New accounts per hour across everyone, in case the code leaks. */
export const NEW_ACCOUNT_LIMIT = 60;
const WINDOW_MS = 60 * 60 * 1000;

/** Sign-up is open when a class code is set and the server can create accounts. */
export function isSignupOpen(): boolean {
  return getSignupCode() !== null && canManageAccounts();
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time comparison; hashing first gives equal-length inputs. */
export function checkSignupCode(input: string, expected: string): boolean {
  return timingSafeEqual(digest(input.trim()), digest(expected));
}

const failures = new Map<string, number[]>();
let newAccounts: number[] = [];

function recent(times: number[], now: number): number[] {
  return times.filter((t) => now - t < WINDOW_MS);
}

export function tooManyFailedCodes(address: string, now: number = Date.now()): boolean {
  return recent(failures.get(address) ?? [], now).length >= FAILED_CODE_LIMIT;
}

export function recordFailedCode(address: string, now: number = Date.now()): void {
  failures.set(address, [...recent(failures.get(address) ?? [], now), now]);
  // Forget addresses with nothing recent, so the map can't grow without end.
  if (failures.size > 1000) {
    for (const [key, times] of failures) if (recent(times, now).length === 0) failures.delete(key);
  }
}

export function newAccountLimitReached(now: number = Date.now()): boolean {
  newAccounts = recent(newAccounts, now);
  return newAccounts.length >= NEW_ACCOUNT_LIMIT;
}

export function recordNewAccount(now: number = Date.now()): void {
  newAccounts = [...recent(newAccounts, now), now];
}

export function resetSignupLimitsForTests(): void {
  failures.clear();
  newAccounts = [];
}
