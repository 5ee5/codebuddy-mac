import "server-only";

/**
 * A small in-memory limit: at most `limit` events per key in a sliding
 * window. Kept per server process, so it resets when the server restarts.
 */
export function createRateLimit(limit: number, windowMs: number) {
  const events = new Map<string, number[]>();
  const recent = (key: string, now: number) => (events.get(key) ?? []).filter((t) => now - t < windowMs);

  return {
    reached(key: string, now: number = Date.now()): boolean {
      return recent(key, now).length >= limit;
    },
    record(key: string, now: number = Date.now()): void {
      events.set(key, [...recent(key, now), now]);
      // Forget keys with nothing recent, so the map can't grow without end.
      if (events.size > 1000) {
        for (const k of events.keys()) if (recent(k, now).length === 0) events.delete(k);
      }
    },
    reset(): void {
      events.clear();
    },
  };
}
