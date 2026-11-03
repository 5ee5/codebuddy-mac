import "server-only";
import { failure } from "@/lib/assistant/errors";
import type { AssistantRequest, AssistantResult } from "@/lib/assistant/types";
import { getSupabaseConfig } from "@/lib/auth/config";
import { getRequestContext, type CodeBuddyClient, type SignedInUser } from "@/lib/auth/server";
import { getServerConfig, type ServerConfig } from "@/lib/server/anthropic";

/*
 * The checks every paid assistant route runs before it looks at the request
 * itself, in this order: same origin, body type and size, server
 * configuration, signed-in user, JSON parse. Each route then validates its
 * own request and takes a usage slot before calling the provider.
 */

export function jsonResult<R extends AssistantRequest>(body: AssistantResult<R>, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Only codes and IDs: never the submitted text, the answer, the key or the session. */
export function logFailure(route: string, code: string, status: number, requestId?: string | null): void {
  console.error(`[${route}]`, code, status, requestId ?? "-");
}

/**
 * Browsers send `Origin` on cross-site POSTs; reject any that is not this
 * host. The session is a cookie, so this check (with the JSON-only body and
 * `SameSite=Lax` cookies) is what stops other websites from sending requests
 * as the user.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/** Reads the body as text, giving up as soon as it exceeds `maxBytes`. */
async function readBody(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export interface GuardOptions {
  /** Label for the server log, e.g. "api/learn". */
  route: string;
  maxBytes: number;
  /** Shown when the body is over `maxBytes`. */
  tooLargeMessage: string;
}

export type GuardResult =
  | { ok: true; config: ServerConfig; user: SignedInUser; supabase: CodeBuddyClient; body: unknown }
  | { ok: false; response: Response };

export async function guardAssistantPost(
  request: Request,
  { route, maxBytes, tooLargeMessage }: GuardOptions,
): Promise<GuardResult> {
  const reject = (response: Response): GuardResult => ({ ok: false, response });

  if (!isSameOrigin(request)) {
    return reject(jsonResult(failure("access_denied", "Requests from other websites aren’t allowed."), 403));
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return reject(jsonResult(failure("invalid_request"), 415));
  }
  const raw = await readBody(request, maxBytes);
  if (raw === null) {
    return reject(jsonResult(failure("invalid_request", tooLargeMessage), 413));
  }

  const config = getServerConfig();
  if (!config || !getSupabaseConfig()) {
    logFailure(route, "not_configured", 503);
    return reject(jsonResult(failure("not_configured"), 503));
  }
  const context = await getRequestContext(request);
  if (!context) {
    return reject(jsonResult(failure("access_denied"), 401));
  }

  try {
    return { ok: true, config, user: context.user, supabase: context.supabase, body: JSON.parse(raw) };
  } catch {
    return reject(jsonResult(failure("invalid_request"), 400));
  }
}

/** The shared hourly or concurrency cap is used up. */
export function capReachedResponse(): Response {
  return jsonResult(
    failure("rate_limited", "CodeBuddy’s hourly question limit has been reached. Try again later."),
    429,
  );
}
