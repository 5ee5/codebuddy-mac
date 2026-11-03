import "server-only";
import type { AssistantAnswer, DebugRequest, LearnRequest } from "@/lib/assistant/types";
import {
  parseDebugRequest,
  parseDebugResponse,
  parseLearnRequest,
  parseLearnResponse,
} from "@/lib/assistant/validation";
import { getSupabase, type CodeBuddyClient } from "@/lib/auth/server";
import type { AiMode, Json } from "@/lib/db/types";

/*
 * Learn and Debug requests in the database: the per-user daily limit and the
 * history. Every call acts as the signed-in user, so row-level security and
 * the database functions decide what is allowed. Only error codes are
 * logged, never the questions, code or answers.
 */

function logDbFailure(action: string, code: string | undefined): void {
  console.error("[db]", action, code ?? "-");
}

export type DailyClaim =
  | { ok: true; requestId: string; remaining: number }
  | { ok: false; retryAt: Date | null };

/**
 * Reserves one AI request for the signed-in user, or reports that today's
 * allowance is used up. `null` means the database couldn't be asked, and the
 * caller should not call the paid API. `supabase` must act as the user
 * making the request (the guard's client), so the daily limit and RLS apply
 * to the right session, whether it came from a cookie or a bearer token.
 */
export async function claimAiRequest(supabase: CodeBuddyClient, mode: AiMode): Promise<DailyClaim | null> {
  const { data, error } = await supabase.rpc("claim_ai_request", { p_mode: mode });
  const row = data?.[0];
  if (error || !row) {
    logDbFailure("claim", error?.code);
    return null;
  }
  if (row.request_id === null) {
    return { ok: false, retryAt: row.retry_at ? new Date(row.retry_at) : null };
  }
  return { ok: true, requestId: row.request_id, remaining: row.remaining };
}

/** Saves a question and its validated answer to the user's history. */
export async function recordAiAnswer<R extends LearnRequest | DebugRequest>(
  supabase: CodeBuddyClient,
  requestId: string,
  answer: AssistantAnswer<R>,
  request: R,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("record_ai_answer", {
    p_request_id: requestId,
    // Plain JSON data that has already been validated.
    p_request: request as unknown as Json,
    p_response: answer.response as unknown as Json,
    p_model: answer.model,
  });
  if (error || data !== true) {
    logDbFailure("record", error?.code ?? "not_recorded");
    return false;
  }
  return true;
}

export interface HistorySummary {
  id: string;
  mode: AiMode;
  createdAt: string;
  /** The question, or the first line of the problem description. */
  title: string;
}

const TITLE_MAX = 140;

function summaryTitle(text: string | null): string {
  const firstLine = (text ?? "").split("\n").find((line) => line.trim())?.trim() ?? "";
  if (!firstLine) return "Untitled";
  return firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1)}…` : firstLine;
}

/** The newest saved entries, without their answers. `null` if the database can't be read. */
export async function listHistory(limit = 50): Promise<HistorySummary[] | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("ai_requests")
    .select("id, mode, created_at, question:request->>question, problem:request->>problem")
    .not("request", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logDbFailure("list", error.code);
    return null;
  }
  return data.map((row) => ({
    id: row.id,
    mode: row.mode,
    createdAt: row.created_at,
    title: summaryTitle(row.mode === "learn" ? row.question : row.problem),
  }));
}

export type HistoryEntry =
  | { id: string; mode: "learn"; request: LearnRequest; answer: AssistantAnswer<LearnRequest> }
  | { id: string; mode: "debug"; request: DebugRequest; answer: AssistantAnswer<DebugRequest> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One saved entry with its answer, checked against the same contracts as a
 * fresh answer. `null` if it doesn't exist, isn't the user's, or doesn't
 * match (a student can write odd data into their own history).
 */
export async function getHistoryEntry(id: string): Promise<HistoryEntry | null> {
  if (!UUID.test(id)) return null;
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data: row, error } = await supabase
    .from("ai_requests")
    .select("id, mode, request, response, model, answered_at")
    .eq("id", id)
    .maybeSingle();
  if (error) logDbFailure("get", error.code);
  if (!row?.request || !row.response || !row.model || !row.answered_at) return null;

  const meta = { status: "answered" as const, model: row.model, createdAt: row.answered_at };
  if (row.mode === "learn") {
    const request = parseLearnRequest(row.request);
    const response = parseLearnResponse(row.response);
    if (!request || !response) return null;
    return { id: row.id, mode: "learn", request, answer: { ...meta, mode: "learn", response } };
  }
  const request = parseDebugRequest(row.request);
  const response = request && parseDebugResponse(row.response, request.language);
  if (!request || !response) return null;
  return { id: row.id, mode: "debug", request, answer: { ...meta, mode: "debug", response } };
}

/** Clears one entry, or the whole history when no id is given. */
export async function clearHistory(id?: string): Promise<boolean> {
  if (id !== undefined && !UUID.test(id)) return false;
  const supabase = await getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.rpc("clear_ai_history", id ? { p_request_id: id } : {});
  if (error) {
    logDbFailure("clear", error.code);
    return false;
  }
  return true;
}
