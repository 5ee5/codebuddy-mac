import type { AssistantErrorCode, AssistantResult, DebugRequest } from "@/lib/assistant/types";

/*
 * The Debug page's request lifecycle as a pure state machine, so loading,
 * success, error, retry and "new session" behaviour can be tested without a
 * browser. The workspace keeps the form fields; this tracks only requests.
 */

export type DebugPhase = "idle" | "pending" | "answered" | "error";

export interface DebugSession {
  phase: DebugPhase;
  /** The last request sent, reused by "Try again". */
  request: DebugRequest | null;
  result: AssistantResult<DebugRequest> | null;
  /** Increases with every send, so a late reply to an older send is ignored. */
  attempt: number;
}

export type DebugEvent =
  | { type: "submit"; request: DebugRequest }
  | { type: "retry" }
  | { type: "settled"; attempt: number; result: AssistantResult<DebugRequest> }
  | { type: "reset" };

export const initialDebugSession: DebugSession = {
  phase: "idle",
  request: null,
  result: null,
  attempt: 0,
};

/** Failures the student has to fix in the form; retrying unchanged can't help. */
const NOT_RETRYABLE: readonly AssistantErrorCode[] = ["invalid_request", "access_denied"];

export function canRetry(session: DebugSession): boolean {
  return (
    session.phase === "error" &&
    session.request !== null &&
    session.result?.status === "error" &&
    !NOT_RETRYABLE.includes(session.result.code)
  );
}

/**
 * Returns the next state, or the same object when the event doesn't apply
 * (for example a second submit while one is pending), so callers can tell
 * that nothing should be sent.
 */
export function debugSession(state: DebugSession, event: DebugEvent): DebugSession {
  switch (event.type) {
    case "submit":
      if (state.phase === "pending") return state;
      return { phase: "pending", request: event.request, result: null, attempt: state.attempt + 1 };
    case "retry":
      if (!canRetry(state)) return state;
      return { ...state, phase: "pending", result: null, attempt: state.attempt + 1 };
    case "settled":
      if (state.phase !== "pending" || event.attempt !== state.attempt) return state;
      return {
        ...state,
        phase: event.result.status === "answered" ? "answered" : "error",
        result: event.result,
      };
    case "reset":
      // Keeps the attempt counter, so a reply to a cleared request is ignored.
      return { ...initialDebugSession, attempt: state.attempt };
  }
}
