import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** Per-request limit for the provider call, in milliseconds. */
export const ANTHROPIC_TIMEOUT_MS = 45_000;

export interface ServerConfig {
  apiKey: string;
  model: string;
}

/**
 * Reads the server-only settings. Returns `null` when anything is missing,
 * so callers fail closed before any paid request is made. These variables
 * must never be prefixed with `NEXT_PUBLIC_`, which would inline them into
 * the browser bundle.
 */
export function getServerConfig(): ServerConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim();
  if (!apiKey || !model) return null;
  return { apiKey, model };
}

/**
 * The SDK retries 408/409/429/5xx twice by default. Requests cost money, so
 * retries are switched off: a failure is reported and the learner decides
 * whether to ask again.
 */
export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: ANTHROPIC_TIMEOUT_MS, maxRetries: 0 });
}
