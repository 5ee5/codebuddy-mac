import { failure } from "@/lib/assistant/errors";
import type { AssistantAnswer, DebugRequest } from "@/lib/assistant/types";
import { hasErrors, parseDebugRequest, validateDebug } from "@/lib/assistant/validation";
import { claimAiRequest, recordAiAnswer } from "@/lib/db/ai-requests";
import { acquireSlot } from "@/lib/server/usage-cap";
import { createAnthropicClient } from "@/lib/server/anthropic";
import { answerDebug } from "@/lib/server/debug";
import {
  capReachedResponse,
  guardAssistantPost,
  jsonResult,
  logFailure,
} from "@/lib/server/route-guard";
import { dailyLimitResponse } from "@/lib/server/daily-limit";

/*
 * POST /api/debug: diagnoses a student's bug with the paid AI API.
 *
 * Same protections and order as /api/learn: same origin, body type and size,
 * server configuration, signed-in user, request validation, the usage cap
 * that Learn and Debug share, then the student's daily allowance. Answers are
 * saved to the student's history. The submitted code and problem are never
 * logged; failures return fixed, friendly messages only.
 */

const ROUTE = "api/debug";

/*
 * 10,000 characters of code plus 4,000 of description, allowing for
 * multi-byte UTF-8 and JSON escaping. Field lengths are checked after parsing.
 */
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  const guard = await guardAssistantPost(request, {
    route: ROUTE,
    maxBytes: MAX_BODY_BYTES,
    tooLargeMessage: "That code is too long to send. Try a smaller piece.",
  });
  if (!guard.ok) return guard.response;

  const debugRequest = parseDebugRequest(guard.body);
  if (!debugRequest) return jsonResult(failure("invalid_request"), 400);
  const fieldErrors = validateDebug(debugRequest);
  if (hasErrors(fieldErrors)) {
    return jsonResult({ ...failure<DebugRequest>("invalid_request"), fieldErrors }, 400);
  }

  const release = acquireSlot();
  if (!release) return capReachedResponse();

  try {
    // The student's own daily allowance, kept in the database. If it can't be
    // checked, don't spend money.
    const claim = await claimAiRequest(guard.supabase, "debug");
    if (!claim) {
      logFailure(ROUTE, "usage_unavailable", 503);
      return jsonResult(failure("unavailable"), 503);
    }
    if (!claim.ok) return dailyLimitResponse(claim.retryAt);

    const outcome = await answerDebug(debugRequest, {
      client: createAnthropicClient(guard.config.apiKey),
      model: guard.config.model,
      signal: request.signal,
    });
    if (!outcome.ok) {
      logFailure(ROUTE, outcome.failure.code, outcome.status, outcome.requestId);
      return jsonResult(outcome.failure, outcome.status);
    }
    const answer: AssistantAnswer<DebugRequest> = {
      status: "answered",
      mode: "debug",
      response: outcome.response,
      model: outcome.model,
      createdAt: new Date().toISOString(),
      remainingToday: claim.remaining,
    };
    // A failed save is logged but doesn't cost the student their answer.
    const saved = await recordAiAnswer(guard.supabase, claim.requestId, answer, debugRequest);
    return jsonResult(saved ? { ...answer, historyId: claim.requestId } : answer, 200);
  } finally {
    release();
  }
}
