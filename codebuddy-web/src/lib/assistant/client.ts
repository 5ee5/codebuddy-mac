import { failure, FAILURE_MESSAGES } from "@/lib/assistant/errors";
import type {
  AssistantErrorCode,
  AssistantPreview,
  AssistantRequest,
  AssistantResult,
  DebugRequest,
  FieldErrors,
  LearnRequest,
  ResponseFor,
} from "@/lib/assistant/types";
import { parseDebugResponse, parseLearnResponse } from "@/lib/assistant/validation";

/** Where a mode's server route lives (`/api/learn` and `/api/debug` exist). */
export function endpointFor(mode: AssistantRequest["mode"]): string {
  return `/api/${mode}`;
}

/** The browser gives up a little after the server's own provider timeout (Learn). */
export const CLIENT_TIMEOUT_MS = 70_000;

/**
 * Local stand-in for modes that are not connected yet. No mode uses it at the
 * moment: Practice checks answers locally with `lib/practice/check.ts`.
 * It makes no network calls: it only echoes the typed request back so the UI
 * can show exactly what would be sent.
 */
export async function previewRequest<R extends AssistantRequest>(
  request: R,
): Promise<AssistantPreview<R>> {
  return {
    status: "not-connected",
    mode: request.mode,
    request,
    plannedEndpoint: endpointFor(request.mode),
    createdAt: new Date().toISOString(),
  };
}

const ERROR_CODES = Object.keys(FAILURE_MESSAGES) as AssistantErrorCode[];

/** History ids are UUIDs; anything else is ignored rather than put into a link. */
const SAFE_ID = /^[0-9a-f-]{36}$/i;

interface PostOptions<R extends AssistantRequest> {
  /** Re-checks the answer against the mode's contract. */
  parse: (response: unknown) => ResponseFor<R> | null;
  /** Request fields the server may report errors for. */
  fields: readonly Exclude<keyof R, "mode">[];
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Sends a request to the mode's server route. The browser adds the sign-in
 * session cookie itself, because the route is on the same site. Never
 * throws: network errors, timeouts and unexpected replies all become a typed
 * `AssistantFailure`.
 */
async function postAssistant<R extends AssistantRequest>(
  request: R,
  { parse, fields, timeoutMs, signal }: PostOptions<R>,
): Promise<AssistantResult<R>> {
  const timeout = AbortSignal.timeout(timeoutMs);
  // `AbortSignal.any` is missing in older browsers; the caller's signal wins there.
  const combined =
    signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, timeout])
      : (signal ?? timeout);

  let res: Response;
  try {
    res = await fetch(endpointFor(request.mode), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: combined,
      cache: "no-store",
    });
  } catch {
    return failure(timeout.aborted ? "timeout" : "network");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return failure(timeout.aborted ? "timeout" : "unavailable");
  }
  return readResult(body, request.mode, parse, fields);
}

/** Accepts only well-formed results from the server, re-checking answers. */
function readResult<R extends AssistantRequest>(
  body: unknown,
  mode: R["mode"],
  parse: PostOptions<R>["parse"],
  fields: PostOptions<R>["fields"],
): AssistantResult<R> {
  if (typeof body !== "object" || body === null) return failure("unavailable");
  const data = body as Record<string, unknown>;

  if (data.status === "answered") {
    const response = parse(data.response);
    if (!response || typeof data.model !== "string" || typeof data.createdAt !== "string") {
      return failure("malformed_output");
    }
    return {
      status: "answered",
      mode,
      response,
      model: data.model,
      createdAt: data.createdAt,
      ...(typeof data.remainingToday === "number" ? { remainingToday: data.remainingToday } : {}),
      ...(typeof data.historyId === "string" && SAFE_ID.test(data.historyId) ? { historyId: data.historyId } : {}),
    };
  }

  if (data.status === "error" && ERROR_CODES.includes(data.code as AssistantErrorCode)) {
    const code = data.code as AssistantErrorCode;
    const result = failure<R>(code, typeof data.message === "string" ? data.message : FAILURE_MESSAGES[code]);
    const reported = data.fieldErrors as Record<string, unknown> | undefined;
    const fieldErrors: FieldErrors<R> = {};
    for (const field of fields) {
      const message = reported?.[field as string];
      if (typeof message === "string") fieldErrors[field] = message;
    }
    if (Object.keys(fieldErrors).length > 0) result.fieldErrors = fieldErrors;
    return result;
  }

  return failure("unavailable");
}

/** Sends a Learn question to `/api/learn`. */
export function askLearn(
  request: LearnRequest,
  signal?: AbortSignal,
): Promise<AssistantResult<LearnRequest>> {
  return postAssistant(request, {
    parse: parseLearnResponse,
    fields: ["question", "level", "topic"],
    timeoutMs: CLIENT_TIMEOUT_MS,
    signal,
  });
}

/** Debug answers can include a whole program, so the browser waits longer. */
export const DEBUG_CLIENT_TIMEOUT_MS = 100_000;

/** Sends code and a problem description to `/api/debug`. */
export function askDebug(
  request: DebugRequest,
  signal?: AbortSignal,
): Promise<AssistantResult<DebugRequest>> {
  return postAssistant(request, {
    parse: (response) => parseDebugResponse(response, request.language),
    fields: ["language", "code", "problem"],
    timeoutMs: DEBUG_CLIENT_TIMEOUT_MS,
    signal,
  });
}
