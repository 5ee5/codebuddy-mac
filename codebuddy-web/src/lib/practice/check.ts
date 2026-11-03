import { LIMITS } from "@/lib/assistant/validation";
import type { Exercise } from "@/lib/exercises";
import { checkCountVowels } from "@/lib/practice/checkers/count-vowels";
import { checkFizzBuzz } from "@/lib/practice/checkers/fizzbuzz";
import { checkGreetUser } from "@/lib/practice/checkers/greet-user";
import { checkLargestNumber } from "@/lib/practice/checkers/largest-number";
import type { Checker, CheckerOutput } from "@/lib/practice/checkers/shared";
import { checkSumList } from "@/lib/practice/checkers/sum-list";
import type { CheckVerdict, PracticeCheck } from "@/lib/practice/types";

/*
 * Checks a Practice solution in the browser by reading it, never by running
 * it: there is no eval, no Function, no worker and no request to a server.
 * Each exercise has its own checker, keyed by exercise id.
 */
export const CHECKERS: Readonly<Record<string, Checker>> = {
  "greet-user": checkGreetUser,
  "sum-list": checkSumList,
  fizzbuzz: checkFizzBuzz,
  "count-vowels": checkCountVowels,
  "largest-number": checkLargestNumber,
};

export const VERDICT_LABELS: Record<CheckVerdict, string> = {
  correct: "Correct",
  partial: "Partly correct",
  incorrect: "Not correct yet",
  unverified: "Checks passed, run it to confirm",
};

export function verdictFor({ checks, tests }: CheckerOutput): CheckVerdict {
  if (checks.some((c) => c.blocking && c.status === "fail")) return "incorrect";
  if (checks.some((c) => c.status === "fail") || tests.some((t) => t.passed === false)) return "partial";
  if (tests.length === 0 || checks.some((c) => c.status === "unverified") || tests.some((t) => t.passed === null)) {
    return "unverified";
  }
  return "correct";
}

function summaryFor(verdict: CheckVerdict, { checks, tests }: CheckerOutput): string {
  switch (verdict) {
    case "correct":
      return `Your solution meets every requirement and passes all ${tests.length} test cases.`;
    case "partial": {
      const failed =
        checks.filter((c) => c.status === "fail").length + tests.filter((t) => t.passed === false).length;
      return `Good progress, but ${failed === 1 ? "1 thing still needs" : `${failed} things still need`} fixing.`;
    }
    case "incorrect":
      return checks.some((c) => c.id === "readable" && c.status === "fail")
        ? "CodeBuddy couldn’t read your code, so it couldn’t check it."
        : "Not there yet. Fix the first unmet requirement below, then check again.";
    case "unverified":
      return "Nothing failed, but your code is written in a way CodeBuddy can’t work through without running it, so it can’t confirm the results. Run it yourself and compare with the expected values below.";
  }
}

function hintFor(verdict: CheckVerdict, output: CheckerOutput): string | null {
  if (verdict === "correct") return null;
  const failedCheck = output.checks.find((c) => c.status === "fail" && c.hint);
  if (failedCheck) return failedCheck.hint ?? null;
  if (output.tests.some((t) => t.passed === false) && output.testHint) return output.testHint;
  if (verdict === "unverified") return "Run your code and compare each result with the expected value.";
  return null;
}

function inputProblem(code: string): CheckerOutput | null {
  if (!code.trim()) {
    return {
      checks: [
        {
          id: "not-empty",
          label: "Has some code",
          status: "fail",
          blocking: true,
          detail: "The editor is empty.",
          hint: "Start from the starter code and fill in the function.",
        },
      ],
      tests: [],
    };
  }
  if (code.length > LIMITS.solutionMax) {
    return {
      checks: [
        {
          id: "length",
          label: `Is under ${LIMITS.solutionMax} characters`,
          status: "fail",
          blocking: true,
          detail: `Your code is ${code.length} characters long.`,
          hint: "These exercises need only a few lines. Remove anything you don’t need.",
        },
      ],
      tests: [],
    };
  }
  return null;
}

export function checkAnswer(exercise: Exercise, code: string, now: Date = new Date()): PracticeCheck {
  const checker = CHECKERS[exercise.id];
  const output: CheckerOutput = inputProblem(code) ??
    (checker
      ? checker(code)
      : {
          checks: [
            {
              id: "supported",
              label: "Can be checked automatically",
              status: "unverified",
              detail: "CodeBuddy has no checks for this exercise yet.",
            },
          ],
          tests: [],
        });
  const verdict = verdictFor(output);
  return {
    exerciseId: exercise.id,
    verdict,
    summary: summaryFor(verdict, output),
    checks: output.checks,
    tests: output.tests,
    hint: hintFor(verdict, output),
    checkedCode: code,
    checkedAt: now.toISOString(),
  };
}
