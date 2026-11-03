import { describe, expect, it } from "vitest";
import type { AssistantResult, DebugRequest } from "@/lib/assistant/types";
import { canRetry, debugSession, initialDebugSession, type DebugSession } from "@/lib/debug-session";

const request: DebugRequest = {
  mode: "debug",
  language: "python",
  code: "for i in range(4):\n    print(i)",
  problem: "It prints one number too many",
};

const answered: AssistantResult<DebugRequest> = {
  status: "answered",
  mode: "debug",
  model: "claude-sonnet-5-5",
  createdAt: "2026-10-24T12:00:00.000Z",
  response: {
    mode: "debug",
    outcome: "diagnosed",
    diagnosis: "range(4) runs four times.",
    explanation: "It counts 0 to 3.",
    confirmed: [],
    hypotheses: [],
    missingInfo: [],
    changes: [],
    nextSteps: ["Try range(3)."],
  },
};

const failed = (code: "unavailable" | "timeout" | "invalid_request" | "access_denied" | "rate_limited") =>
  ({ status: "error", code, message: "No" }) as AssistantResult<DebugRequest>;

function pending(): DebugSession {
  return debugSession(initialDebugSession, { type: "submit", request });
}

describe("debugSession", () => {
  it("starts idle with nothing sent", () => {
    expect(initialDebugSession).toEqual({ phase: "idle", request: null, result: null, attempt: 0 });
  });

  it("goes to pending on submit and remembers the request", () => {
    expect(pending()).toEqual({ phase: "pending", request, result: null, attempt: 1 });
  });

  it("ignores a second submit while one is pending (no duplicate paid request)", () => {
    const state = pending();
    expect(debugSession(state, { type: "submit", request: { ...request, problem: "Other" } })).toBe(state);
  });

  it("shows the answer when the current attempt succeeds", () => {
    const state = debugSession(pending(), { type: "settled", attempt: 1, result: answered });
    expect(state).toMatchObject({ phase: "answered", result: answered, request });
  });

  it("shows the error when the current attempt fails", () => {
    const state = debugSession(pending(), { type: "settled", attempt: 1, result: failed("unavailable") });
    expect(state.phase).toBe("error");
    expect(canRetry(state)).toBe(true);
  });

  it("ignores a late reply to an older attempt", () => {
    const state = pending();
    expect(debugSession(state, { type: "settled", attempt: 0, result: answered })).toBe(state);
  });

  it("ignores replies that arrive when nothing is pending", () => {
    expect(debugSession(initialDebugSession, { type: "settled", attempt: 0, result: answered })).toBe(
      initialDebugSession,
    );
  });

  it("retries the same request from an error, as a new attempt", () => {
    const errored = debugSession(pending(), { type: "settled", attempt: 1, result: failed("timeout") });
    const retried = debugSession(errored, { type: "retry" });
    expect(retried).toEqual({ phase: "pending", request, result: null, attempt: 2 });
  });

  it.each(["invalid_request", "access_denied"] as const)("does not offer retry after %s", (code) => {
    const errored = debugSession(pending(), { type: "settled", attempt: 1, result: failed(code) });
    expect(canRetry(errored)).toBe(false);
    expect(debugSession(errored, { type: "retry" })).toBe(errored);
  });

  it("does not retry from idle, pending or answered", () => {
    const answeredState = debugSession(pending(), { type: "settled", attempt: 1, result: answered });
    for (const state of [initialDebugSession, pending(), answeredState]) {
      expect(canRetry(state)).toBe(false);
      expect(debugSession(state, { type: "retry" })).toBe(state);
    }
  });

  it("allows a new submit after an answer or an error", () => {
    const answeredState = debugSession(pending(), { type: "settled", attempt: 1, result: answered });
    expect(debugSession(answeredState, { type: "submit", request }).phase).toBe("pending");
    const errored = debugSession(pending(), { type: "settled", attempt: 1, result: failed("rate_limited") });
    expect(debugSession(errored, { type: "submit", request }).attempt).toBe(2);
  });

  it("resets everything for a new session, ignoring any reply still in flight", () => {
    const reset = debugSession(pending(), { type: "reset" });
    expect(reset).toEqual({ phase: "idle", request: null, result: null, attempt: 1 });
    expect(debugSession(reset, { type: "settled", attempt: 1, result: answered })).toBe(reset);
  });
});
