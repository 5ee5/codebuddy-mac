import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PracticeFeedback } from "@/components/practice-feedback";
import { getExercise } from "@/lib/exercises";
import { checkAnswer } from "@/lib/practice/check";
import type { PracticeCheck } from "@/lib/practice/types";
import { accessibleText } from "@/test/markup";

const at = new Date("2026-10-25T10:00:00Z");
const check = (id: string, code: string) => checkAnswer(getExercise(id)!, code, at);
const text = (result: PracticeCheck, stale = false) =>
  accessibleText(renderToStaticMarkup(<PracticeFeedback check={result} stale={stale} />));

describe("PracticeFeedback", () => {
  it("shows a correct verdict, passed checks and tests, and no hint", () => {
    const t = text(check("greet-user", 'def greet(name):\n    return f"Hello, {name}!"'));
    expect(t).toContain("Correct");
    expect(t).toContain("passes all 3 test cases");
    expect(t).toContain("Passed: Defines greet(name) with one parameter");
    expect(t).toContain('Passed: Greets Ada');
    expect(t).toContain('greet("Ada")');
    expect(t).not.toContain("Next hint");
    expect(t).not.toContain("Not met:");
  });

  it("always says the code was not run or sent", () => {
    const t = text(check("fizzbuzz", "for (let i = 1; i <= 15; i++) {\n  console.log(i);\n}"));
    expect(t).toContain("Your code was never run, and nothing was sent anywhere.");
  });

  it("shows failed tests with expected and actual values, and a hint", () => {
    const t = text(check("sum-list", "def total(numbers):\n    t = 1\n    for n in numbers:\n        t += n\n    return t"));
    expect(t).toContain("Partly correct");
    expect(t).toContain("Not met: An empty list");
    expect(t).toMatch(/total\(\[\]\)\s*Expected\s*0\s*Your code\s*1/);
    expect(t).toContain("Next hint");
    expect(t).toContain("empty list");
  });

  it("marks failed requirements with their details", () => {
    const t = text(check("greet-user", 'def greet(name):\n    print(f"Hello, {name}!")'));
    expect(t).toContain("Not correct yet");
    expect(t).toContain("Not met: Returns a value");
    expect(t).toContain("prints its result but doesn’t return it");
    expect(t).not.toContain("Test cases");
  });

  it("explains unverified results without claiming success", () => {
    const t = text(check("sum-list", "def total(numbers):\n    if not numbers:\n        return 0\n    return numbers[0] + total(numbers[1:])"));
    expect(t).toContain("Checks passed, run it to confirm");
    expect(t).toContain("Not checked: The example list");
    expect(t).toContain("Can’t tell without running it");
    expect(t).not.toMatch(/\bCorrect\b/);
  });

  it("reports unreadable code", () => {
    const t = text(check("count-vowels", 'def count_vowels(text):\n    return "abc'));
    expect(t).toContain("Not met: The code can be read");
    expect(t).toContain("line 2");
  });

  it("notes when the code changed since the check", () => {
    const result = check("greet-user", 'def greet(name):\n    return f"Hello, {name}!"');
    expect(text(result, true)).toContain("You’ve changed your code since this check.");
    expect(text(result, false)).not.toContain("You’ve changed your code");
  });

  it("never shows a model solution", () => {
    for (const [id, code] of [
      ["greet-user", "def greet(name):\n    return name"],
      ["sum-list", "def total(numbers):\n    return 0"],
      ["count-vowels", "def count_vowels(text):\n    return 0"],
      ["fizzbuzz", "for (let i = 1; i <= 15; i++) console.log(i);"],
    ]) {
      const t = text(check(id, code));
      expect(t).not.toMatch(/return f"Hello|result \+= number|in "aeiou"|% 15 === 0/);
    }
  });
});
