/*
 * Request/response contracts between the UI and the AI assistant.
 *
 * Every request carries a `mode` discriminant, so `AssistantRequest` can be
 * narrowed with a simple `switch (request.mode)`, both in the browser and in
 * the server-side route handlers. Learn and Debug are connected to the Claude
 * API (`/api/learn`, `/api/debug`). Practice checks answers locally without AI
 * (`lib/practice`); `PracticeRequest`/`PracticeResponse` are kept for future AI feedback.
 */
import type { ModeId } from "@/lib/modes";

export type LearnerLevel = "beginner" | "basics" | "comfortable";

export type ProgrammingLanguage =
  | "python"
  | "javascript"
  | "java"
  | "cpp"
  | "csharp"
  | "other";

export interface CodeSnippet {
  language: ProgrammingLanguage;
  code: string;
}

// ---------------------------------------------------------------- Learn ----

export interface LearnRequest {
  mode: "learn";
  question: string;
  level: LearnerLevel;
  /** Set when the learner started from one of the example-topic chips. */
  topic?: string;
}

export interface LearnResponse {
  mode: "learn";
  explanation: string;
  example?: CodeSnippet;
  keyPoints: string[];
  followUpQuestions: string[];
}

// ---------------------------------------------------------------- Debug ----

export interface DebugRequest {
  mode: "debug";
  language: ProgrammingLanguage;
  /** The student's code, indentation intact. */
  code: string;
  /** The error message, or what they expected versus what happened. */
  problem: string;
}

export interface DebugChange {
  change: string;
  reason: string;
}

export interface DebugResponse {
  mode: "debug";
  /** `needs_more_info` when the code and description aren't enough to say. */
  outcome: "diagnosed" | "needs_more_info";
  diagnosis: string;
  explanation: string;
  /** Facts that are directly visible in the code or the error. */
  confirmed: string[];
  /** Possible causes that the model could not confirm. */
  hypotheses: string[];
  /** What the student should add; never empty for `needs_more_info`. */
  missingInfo: string[];
  /** A complete corrected program. Never present for `needs_more_info`. */
  correctedCode?: CodeSnippet;
  changes: DebugChange[];
  nextSteps: string[];
}

// ------------------------------------------------------------- Practice ----

export interface PracticeRequest {
  mode: "practice";
  exerciseId: string;
  language: ProgrammingLanguage;
  solution: string;
  /** How many hints the learner opened, useful for future learning history. */
  hintsOpened: number;
}

export interface PracticeResponse {
  mode: "practice";
  verdict: "correct" | "almost" | "incorrect";
  feedback: string;
  nextHint?: string;
  improvedSolution?: CodeSnippet;
}

// ---------------------------------------------------------------- Union ----

export type AssistantRequest = LearnRequest | DebugRequest | PracticeRequest;
export type AssistantResponse = LearnResponse | DebugResponse | PracticeResponse;

/** The response type that belongs to a given request type. */
export type ResponseFor<R extends AssistantRequest> = Extract<
  AssistantResponse,
  { mode: R["mode"] }
>;

/**
 * What the local stub returns for modes that are not connected yet. Nothing
 * leaves the browser; `status: "not-connected"` keeps it distinct from a real
 * `AssistantAnswer`.
 */
export interface AssistantPreview<R extends AssistantRequest = AssistantRequest> {
  status: "not-connected";
  mode: ModeId;
  request: R;
  /** Where the request will be sent once the backend exists. */
  plannedEndpoint: string;
  createdAt: string;
}

/** Field-level validation messages, keyed by request property. */
export type FieldErrors<R extends AssistantRequest> = Partial<
  Record<Exclude<keyof R, "mode">, string>
>;

// -------------------------------------------------------- Live results ----

/** A genuine answer produced by the AI model and validated on the server. */
export interface AssistantAnswer<R extends AssistantRequest = AssistantRequest> {
  status: "answered";
  mode: R["mode"];
  response: ResponseFor<R>;
  /** The model that produced the answer, shown to the learner. */
  model: string;
  createdAt: string;
  /** Questions the student can still ask in the next 24 hours, when known. */
  remainingToday?: number;
  /** Set when the answer was saved to the student's history. */
  historyId?: string;
}

export type AssistantErrorCode =
  | "invalid_request"
  | "access_denied"
  | "not_configured"
  | "rate_limited"
  | "refused"
  | "malformed_output"
  | "unavailable"
  | "timeout"
  | "network";

/** A safe, user-facing failure. Never carries provider details. */
export interface AssistantFailure<R extends AssistantRequest = AssistantRequest> {
  status: "error";
  code: AssistantErrorCode;
  message: string;
  fieldErrors?: FieldErrors<R>;
}

export type AssistantResult<R extends AssistantRequest = AssistantRequest> =
  | AssistantAnswer<R>
  | AssistantFailure<R>;
