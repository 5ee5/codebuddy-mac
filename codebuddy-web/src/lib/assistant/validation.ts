import type {
  CodeSnippet,
  DebugChange,
  DebugRequest,
  DebugResponse,
  FieldErrors,
  LearnerLevel,
  LearnRequest,
  LearnResponse,
  PracticeRequest,
} from "@/lib/assistant/types";
import { LANGUAGES } from "@/lib/languages";

/*
 * Pure validation for each request type. The workspaces use these before
 * calling the assistant, and the API routes run the same functions on the
 * server so both sides enforce identical rules.
 */
export const LIMITS = {
  questionMin: 10,
  questionMax: 2000,
  codeMax: 10000,
  problemMin: 10,
  problemMax: 4000,
  solutionMax: 10000,
  topicMax: 60,
} as const;

/*
 * Upper bounds for a Learn answer. They keep answers short enough for a
 * beginner to read and fit the server's 2,000-token output budget.
 */
export const LEARN_OUTPUT_LIMITS = {
  explanationMax: 2500,
  keyPointsMin: 1,
  keyPointsMax: 5,
  followUpMax: 3,
  itemMax: 200,
  exampleCodeMax: 1500,
} as const;

/*
 * Upper bounds for a Debug answer. The corrected code may be a little longer
 * than the submitted code (`LIMITS.codeMax`), never much longer.
 */
export const DEBUG_OUTPUT_LIMITS = {
  diagnosisMax: 400,
  explanationMax: 3000,
  listMax: 5,
  missingInfoMax: 4,
  changesMax: 8,
  nextStepsMin: 1,
  itemMax: 300,
  correctedCodeMax: 12000,
} as const;

export const LEARNER_LEVELS: readonly LearnerLevel[] = ["beginner", "basics", "comfortable"];

export function validateLearn(req: LearnRequest): FieldErrors<LearnRequest> {
  const errors: FieldErrors<LearnRequest> = {};
  const question = req.question.trim();
  if (!question) {
    errors.question = "Type a question, or pick an example topic above.";
  } else if (question.length < LIMITS.questionMin) {
    errors.question = `Add a little more detail: at least ${LIMITS.questionMin} characters.`;
  } else if (question.length > LIMITS.questionMax) {
    errors.question = `Keep your question under ${LIMITS.questionMax} characters.`;
  }
  return errors;
}

export function validateDebug(req: DebugRequest): FieldErrors<DebugRequest> {
  const errors: FieldErrors<DebugRequest> = {};
  const problem = req.problem.trim();
  if (!req.code.trim()) {
    errors.code = "Paste the code that isn’t working.";
  } else if (req.code.length > LIMITS.codeMax) {
    errors.code = `Code is too long: keep it under ${LIMITS.codeMax} characters.`;
  }
  if (!problem) {
    errors.problem = "Describe the problem: paste the error message, or say what you expected to happen.";
  } else if (problem.length < LIMITS.problemMin) {
    errors.problem = `Add a little more detail: at least ${LIMITS.problemMin} characters.`;
  } else if (problem.length > LIMITS.problemMax) {
    errors.problem = `Keep the description under ${LIMITS.problemMax} characters.`;
  }
  return errors;
}

export function validatePractice(
  req: PracticeRequest,
  starterCode: string,
): FieldErrors<PracticeRequest> {
  const errors: FieldErrors<PracticeRequest> = {};
  const solution = req.solution.trim();
  if (!solution) {
    errors.solution = "Write your solution before asking for feedback.";
  } else if (solution === starterCode.trim()) {
    errors.solution = "This is still the starter code. Change it to add your solution.";
  } else if (req.solution.length > LIMITS.solutionMax) {
    errors.solution = `Solution is too long: keep it under ${LIMITS.solutionMax} characters.`;
  }
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

// ------------------------------------------------- Untrusted JSON parsing ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isTextList(value: unknown, min: number, max: number, itemMax: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((item) => isText(item, itemMax))
  );
}

/**
 * Checks the shape of a Learn request body that arrived as untrusted JSON.
 * Returns a fresh object without unknown keys, or `null` if the shape is
 * wrong. Content rules (length and so on) stay in `validateLearn`.
 */
export function parseLearnRequest(body: unknown): LearnRequest | null {
  if (!isRecord(body) || body.mode !== "learn") return null;
  const { question, level, topic } = body;
  if (typeof question !== "string") return null;
  if (!LEARNER_LEVELS.includes(level as LearnerLevel)) return null;
  if (topic !== undefined && !isText(topic, LIMITS.topicMax)) return null;
  return {
    mode: "learn",
    question: question.trim(),
    level: level as LearnerLevel,
    ...(topic !== undefined ? { topic: (topic as string).trim() } : {}),
  };
}

/**
 * Checks model output against the `LearnResponse` contract. The model is
 * asked for `example: null` when it has no example; that becomes an absent
 * field. Returns `null` for anything that does not match exactly.
 */
export function parseLearnResponse(value: unknown): LearnResponse | null {
  if (!isRecord(value)) return null;
  const L = LEARN_OUTPUT_LIMITS;
  const { explanation, keyPoints, followUpQuestions, example } = value;
  if (!isText(explanation, L.explanationMax)) return null;
  if (!isTextList(keyPoints, L.keyPointsMin, L.keyPointsMax, L.itemMax)) return null;
  if (!isTextList(followUpQuestions, 0, L.followUpMax, L.itemMax)) return null;

  let snippet: CodeSnippet | undefined;
  if (example !== null && example !== undefined) {
    if (!isRecord(example)) return null;
    const { language, code } = example;
    if (!LANGUAGES.includes(language as CodeSnippet["language"])) return null;
    if (!isText(code, L.exampleCodeMax)) return null;
    snippet = { language: language as CodeSnippet["language"], code };
  }

  return {
    mode: "learn",
    explanation: explanation.trim(),
    ...(snippet ? { example: snippet } : {}),
    keyPoints: keyPoints.map((point) => point.trim()),
    followUpQuestions: followUpQuestions.map((question) => question.trim()),
  };
}

/**
 * Checks the shape of a Debug request body that arrived as untrusted JSON.
 * Code keeps its indentation; only trailing whitespace is dropped. Content
 * rules (empty, too long) stay in `validateDebug`.
 */
export function parseDebugRequest(body: unknown): DebugRequest | null {
  if (!isRecord(body) || body.mode !== "debug") return null;
  const { language, code, problem } = body;
  if (!LANGUAGES.includes(language as CodeSnippet["language"])) return null;
  if (typeof code !== "string" || typeof problem !== "string") return null;
  return {
    mode: "debug",
    language: language as CodeSnippet["language"],
    code: code.trimEnd(),
    problem: problem.trim(),
  };
}

function isChangeList(value: unknown, max: number, itemMax: number): value is DebugChange[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every(
      (item) => isRecord(item) && isText(item.change, itemMax) && isText(item.reason, itemMax),
    )
  );
}

/**
 * Checks model output against the `DebugResponse` contract, including the
 * rules that link fields: an answer that needs more information lists what
 * is missing and contains no corrected code; corrected code comes with at
 * least one explained change and stays in the student's language. Corrected
 * code is kept byte for byte. Returns `null` for anything else.
 */
export function parseDebugResponse(
  value: unknown,
  requestLanguage: CodeSnippet["language"],
): DebugResponse | null {
  if (!isRecord(value)) return null;
  const L = DEBUG_OUTPUT_LIMITS;
  const { outcome, diagnosis, explanation, confirmed, hypotheses, missingInfo, correctedCode, changes, nextSteps } =
    value;
  if (outcome !== "diagnosed" && outcome !== "needs_more_info") return null;
  if (!isText(diagnosis, L.diagnosisMax) || !isText(explanation, L.explanationMax)) return null;
  if (!isTextList(confirmed, 0, L.listMax, L.itemMax)) return null;
  if (!isTextList(hypotheses, 0, L.listMax, L.itemMax)) return null;
  if (!isTextList(missingInfo, 0, L.missingInfoMax, L.itemMax)) return null;
  if (!isChangeList(changes, L.changesMax, L.itemMax)) return null;
  if (!isTextList(nextSteps, L.nextStepsMin, L.listMax, L.itemMax)) return null;

  let snippet: CodeSnippet | undefined;
  if (correctedCode !== null && correctedCode !== undefined) {
    if (!isRecord(correctedCode)) return null;
    const { language, code } = correctedCode;
    if (!LANGUAGES.includes(language as CodeSnippet["language"])) return null;
    if (requestLanguage !== "other" && language !== requestLanguage) return null;
    if (!isText(code, L.correctedCodeMax)) return null;
    snippet = { language: language as CodeSnippet["language"], code };
  }

  if (outcome === "needs_more_info" && (missingInfo.length === 0 || snippet)) return null;
  if (snippet && changes.length === 0) return null;

  const trimAll = (items: string[]) => items.map((item) => item.trim());
  return {
    mode: "debug",
    outcome,
    diagnosis: diagnosis.trim(),
    explanation: explanation.trim(),
    confirmed: trimAll(confirmed),
    hypotheses: trimAll(hypotheses),
    missingInfo: trimAll(missingInfo),
    ...(snippet ? { correctedCode: snippet } : {}),
    changes: changes.map(({ change, reason }) => ({ change: change.trim(), reason: reason.trim() })),
    nextSteps: trimAll(nextSteps),
  };
}
