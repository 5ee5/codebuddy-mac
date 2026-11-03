import "server-only";
import { failure } from "@/lib/assistant/errors";
import { jsonResult } from "@/lib/server/route-guard";

/**
 * Learn and Debug questions each student may ask in any 24 hours. The
 * database enforces it (`claim_ai_request`); this copy is only for messages
 * and must match the migration (a test checks it).
 */
export const DAILY_REQUEST_LIMIT = 20;

/** "in about 3 hours", "in about 25 minutes": when the student can ask again. */
export function waitText(retryAt: Date | null, now: Date = new Date()): string {
  if (!retryAt) return "later";
  const minutes = Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return minutes === 1 ? "in about a minute" : `in about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "in about an hour" : `in about ${hours} hours`;
}

/** The student has used all of today's questions. */
export function dailyLimitResponse(retryAt: Date | null): Response {
  return jsonResult(
    failure(
      "rate_limited",
      `You’ve used all ${DAILY_REQUEST_LIMIT} of today’s questions. You can ask again ${waitText(retryAt)}.`,
    ),
    429,
  );
}
