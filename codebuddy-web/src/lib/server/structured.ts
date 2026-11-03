import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { failure } from "@/lib/assistant/errors";
import type { AssistantErrorCode, AssistantFailure, AssistantRequest } from "@/lib/assistant/types";

/** The minimum of the SDK client the assistant modules need; easy to mock. */
export type MessagesClient = Pick<Anthropic, "messages">;

export type StructuredOutcome<T, R extends AssistantRequest> =
  | { ok: true; value: T; model: string }
  | { ok: false; status: number; failure: AssistantFailure<R>; requestId?: string | null };

export interface StructuredRequest<T> {
  client: MessagesClient;
  model: string;
  system: string;
  userMessage: string;
  /** JSON schema the answer must follow (structured outputs). */
  schema: Record<string, unknown>;
  maxTokens: number;
  /** Shown when the answer hit `maxTokens` and was cut off. */
  tooLongMessage: string;
  /** Validates the parsed JSON against the app's contract; `null` if it doesn't match. */
  parse: (value: unknown) => T | null;
  /** Stops the provider call if the browser disconnects. */
  signal?: AbortSignal;
  /** Overrides the client's default timeout for longer answers. */
  timeoutMs?: number;
}

function fail<R extends AssistantRequest>(
  status: number,
  code: AssistantErrorCode,
  message?: string,
  requestId?: string | null,
): StructuredOutcome<never, R> {
  return { ok: false, status, failure: failure<R>(code, message), requestId };
}

/**
 * Asks the model for one JSON answer and validates it against the contract.
 * Never throws: refusals, cut-off answers, invalid JSON, contract violations
 * and provider errors all become a safe outcome with a fixed message.
 */
export async function askForJson<T, R extends AssistantRequest>({
  client,
  model,
  system,
  userMessage,
  schema,
  maxTokens,
  tooLongMessage,
  parse,
  signal,
  timeoutMs,
}: StructuredRequest<T>): Promise<StructuredOutcome<T, R>> {
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userMessage }],
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema },
        },
      },
      timeoutMs === undefined ? { signal } : { signal, timeout: timeoutMs },
    );
  } catch (error) {
    return mapProviderError<R>(error);
  }

  if (message.stop_reason === "refusal") return fail(422, "refused");
  if (message.stop_reason === "max_tokens") return fail(502, "malformed_output", tooLongMessage);

  const text = message.content.find((block) => block.type === "text")?.text;
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  const value = parse(parsed);
  if (value === null) return fail(502, "malformed_output");

  return { ok: true, value, model: message.model || model };
}

/**
 * Maps SDK errors (most specific first) to a safe code and HTTP status. The
 * provider's own message is deliberately dropped; only its request ID is kept
 * for the server log.
 */
export function mapProviderError<R extends AssistantRequest>(
  error: unknown,
): StructuredOutcome<never, R> {
  const requestId = error instanceof Anthropic.APIError ? error.requestID : undefined;
  if (error instanceof Anthropic.RateLimitError) return fail(429, "rate_limited", undefined, requestId);
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof Anthropic.NotFoundError
  ) {
    return fail(503, "not_configured", undefined, requestId);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return fail(504, "timeout");
  if (error instanceof Anthropic.BadRequestError) return fail(502, "unavailable", undefined, requestId);
  if (error instanceof Anthropic.APIError) return fail(503, "unavailable", undefined, requestId);
  return fail(500, "unavailable");
}
