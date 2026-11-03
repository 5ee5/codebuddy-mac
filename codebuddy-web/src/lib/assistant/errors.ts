import type { AssistantErrorCode, AssistantFailure, AssistantRequest } from "@/lib/assistant/types";

/*
 * Fixed, learner-friendly messages for every failure. Both the API routes and
 * the browser client use these, so a provider error, stack trace or request
 * ID can never reach the page.
 */
export const FAILURE_MESSAGES: Record<AssistantErrorCode, string> = {
  invalid_request: "Some details need fixing before CodeBuddy can answer.",
  access_denied: "You need to be signed in to use the AI tutor. Sign in, then try again.",
  not_configured: "The AI tutor isn’t set up on this server yet. Ask the person running CodeBuddy.",
  rate_limited: "CodeBuddy is getting a lot of questions right now. Wait a minute, then try again.",
  refused: "CodeBuddy can’t help with that question. Try asking about a programming topic.",
  malformed_output: "CodeBuddy’s answer came back incomplete. Try again, or ask a narrower question.",
  unavailable: "The AI tutor is unavailable right now. Try again in a little while.",
  timeout: "CodeBuddy took too long to answer. Try again, or ask a shorter question.",
  network: "Couldn’t reach the CodeBuddy server. Check your connection and try again.",
};

export function failure<R extends AssistantRequest = AssistantRequest>(
  code: AssistantErrorCode,
  message: string = FAILURE_MESSAGES[code],
): AssistantFailure<R> {
  return { status: "error", code, message };
}
