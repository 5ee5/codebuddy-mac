/*
 * Result of checking a Practice solution. The checker reads the code as text
 * and never runs it, so every part of the result says how sure it is.
 */

/** `unverified` means CodeBuddy could not decide without running the code. */
export type CheckStatus = "pass" | "fail" | "unverified";

/** One requirement of the exercise, checked by reading the code. */
export interface RequirementCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** What CodeBuddy found, in plain words. */
  detail?: string;
  /** A failed blocking check means the solution cannot work as asked. */
  blocking?: boolean;
  /** A nudge towards the fix that does not give away the answer. */
  hint?: string;
}

/**
 * One deterministic test case. `actual` and `passed` are `null` when the
 * code is written in a way CodeBuddy cannot work through without running it.
 */
export interface TestCaseResult {
  label: string;
  /** The call or input, for example `greet("Ada")`. */
  call: string;
  expected: string;
  actual: string | null;
  passed: boolean | null;
}

/**
 * - `correct`: the whole solution matches a supported pattern and every test passes.
 * - `partial`: blocking requirements are met, but a check or test fails.
 * - `incorrect`: the code can't be read, or a blocking requirement fails.
 * - `unverified`: nothing failed, but the tests can't be worked out without running the code.
 */
export type CheckVerdict = "correct" | "partial" | "incorrect" | "unverified";

export interface PracticeCheck {
  exerciseId: string;
  verdict: CheckVerdict;
  summary: string;
  checks: RequirementCheck[];
  tests: TestCaseResult[];
  /** The most useful next nudge, or `null` when there is nothing to fix. */
  hint: string | null;
  /** The exact code that was checked, so the UI can tell when it changed. */
  checkedCode: string;
  checkedAt: string;
}
