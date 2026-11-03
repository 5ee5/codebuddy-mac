import "server-only";

/*
 * A small in-memory cap on paid API use, shared by every signed-in user. It
 * limits the total spend even if one account is misused. It is kept per
 * server process, so it resets when the server restarts.
 */

export const HOURLY_REQUEST_LIMIT = 30;
export const CONCURRENT_REQUEST_LIMIT = 2;
const WINDOW_MS = 60 * 60 * 1000;

// One fixed window per server process; it resets when the server restarts.
let windowStart = 0;
let windowCount = 0;
let inFlight = 0;

/**
 * Reserves room for one provider call. Returns a release function, or `null`
 * when the hourly cap or the concurrency limit is reached.
 */
export function acquireSlot(now: number = Date.now()): (() => void) | null {
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= HOURLY_REQUEST_LIMIT || inFlight >= CONCURRENT_REQUEST_LIMIT) {
    return null;
  }
  windowCount += 1;
  inFlight += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlight -= 1;
  };
}

export function resetUsageForTests(): void {
  windowStart = 0;
  windowCount = 0;
  inFlight = 0;
}
