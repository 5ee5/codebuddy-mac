import { describe, expect, it } from "vitest";
import {
  DEBUG_OUTPUT_LIMITS,
  LEARN_OUTPUT_LIMITS,
  LIMITS,
  parseDebugRequest,
  parseDebugResponse,
  parseLearnRequest,
  parseLearnResponse,
  validateDebug,
  validateLearn,
  validatePractice,
} from "@/lib/assistant/validation";

const validAnswer = {
  explanation: "A variable is a named box that stores a value.\n\nYou can change what is inside.",
  example: { language: "python", code: "age = 12\nprint(age)" },
  keyPoints: ["A variable has a name and a value."],
  followUpQuestions: ["What types of values can a variable hold?"],
};

describe("parseLearnRequest", () => {
  it("accepts a well-formed request and drops unknown keys", () => {
    const parsed = parseLearnRequest({
      mode: "learn",
      question: "  What is a variable?  ",
      level: "basics",
      topic: "Variables",
      apiKey: "should-be-dropped",
    });
    expect(parsed).toEqual({
      mode: "learn",
      question: "What is a variable?",
      level: "basics",
      topic: "Variables",
    });
  });

  it("allows the topic to be absent", () => {
    expect(parseLearnRequest({ mode: "learn", question: "Explain loops please", level: "beginner" }))
      .toEqual({ mode: "learn", question: "Explain loops please", level: "beginner" });
  });

  it.each([
    ["not an object", "hello"],
    ["null", null],
    ["an array", []],
    ["the wrong mode", { mode: "debug", question: "x".repeat(20), level: "beginner" }],
    ["a non-string question", { mode: "learn", question: 42, level: "beginner" }],
    ["an unknown level", { mode: "learn", question: "x".repeat(20), level: "expert" }],
    ["a non-string topic", { mode: "learn", question: "x".repeat(20), level: "beginner", topic: 1 }],
    [
      "an oversized topic",
      { mode: "learn", question: "x".repeat(20), level: "beginner", topic: "t".repeat(LIMITS.topicMax + 1) },
    ],
  ])("rejects %s", (_label, body) => {
    expect(parseLearnRequest(body)).toBeNull();
  });

  it("leaves length rules to validateLearn", () => {
    const parsed = parseLearnRequest({ mode: "learn", question: "short", level: "beginner" });
    expect(parsed).not.toBeNull();
    expect(validateLearn(parsed!).question).toMatch(/at least/);
  });
});

describe("parseLearnResponse", () => {
  it("accepts a contract-shaped answer and adds the mode", () => {
    expect(parseLearnResponse(validAnswer)).toEqual({ mode: "learn", ...validAnswer });
  });

  it("turns example: null into an absent example", () => {
    const parsed = parseLearnResponse({ ...validAnswer, example: null });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("example");
  });

  it("drops unexpected keys", () => {
    const parsed = parseLearnResponse({ ...validAnswer, html: "<script>alert(1)</script>" });
    expect(parsed).not.toHaveProperty("html");
  });

  const L = LEARN_OUTPUT_LIMITS;
  it.each([
    ["a missing explanation", { ...validAnswer, explanation: undefined }],
    ["an empty explanation", { ...validAnswer, explanation: "   " }],
    ["an oversized explanation", { ...validAnswer, explanation: "x".repeat(L.explanationMax + 1) }],
    ["no key points", { ...validAnswer, keyPoints: [] }],
    ["too many key points", { ...validAnswer, keyPoints: Array(L.keyPointsMax + 1).fill("point") }],
    ["a non-string key point", { ...validAnswer, keyPoints: [1] }],
    ["an oversized key point", { ...validAnswer, keyPoints: ["x".repeat(L.itemMax + 1)] }],
    ["too many follow-ups", { ...validAnswer, followUpQuestions: Array(L.followUpMax + 1).fill("q?") }],
    ["follow-ups that are not a list", { ...validAnswer, followUpQuestions: "q?" }],
    ["an unknown example language", { ...validAnswer, example: { language: "rust", code: "fn main() {}" } }],
    ["empty example code", { ...validAnswer, example: { language: "python", code: "" } }],
    [
      "oversized example code",
      { ...validAnswer, example: { language: "python", code: "x".repeat(L.exampleCodeMax + 1) } },
    ],
    ["a non-object example", { ...validAnswer, example: "print(1)" }],
    ["a non-object answer", "just text"],
  ])("rejects %s", (_label, value) => {
    expect(parseLearnResponse(value)).toBeNull();
  });
});

// ------------------------------------------------------------------ Debug ----

const studentCode = "numbers = [10, 20, 30]\n\nfor i in range(4):\n    print(numbers[i])";

describe("parseDebugRequest", () => {
  it("accepts a well-formed request, keeps indentation and drops unknown keys", () => {
    expect(
      parseDebugRequest({
        mode: "debug",
        language: "python",
        code: `${studentCode}\n\n  `,
        problem: "  IndexError: list index out of range  ",
        secret: "dropped",
      }),
    ).toEqual({
      mode: "debug",
      language: "python",
      code: studentCode,
      problem: "IndexError: list index out of range",
    });
  });

  it.each([
    ["not an object", "code"],
    ["the wrong mode", { mode: "learn", language: "python", code: "x", problem: "y" }],
    ["an unknown language", { mode: "debug", language: "rust", code: "x", problem: "y" }],
    ["non-string code", { mode: "debug", language: "python", code: 1, problem: "y" }],
    ["a missing problem", { mode: "debug", language: "python", code: "x" }],
  ])("rejects %s", (_label, body) => {
    expect(parseDebugRequest(body)).toBeNull();
  });
});

describe("validateDebug", () => {
  const base = { mode: "debug" as const, language: "python" as const, code: studentCode, problem: "It crashes with IndexError" };

  it("accepts code with a described problem", () => {
    expect(validateDebug(base)).toEqual({});
  });

  it.each([
    ["empty code", { code: "" }, "code", /Paste the code/],
    ["whitespace-only code", { code: "  \n\t " }, "code", /Paste the code/],
    ["oversized code", { code: "x".repeat(LIMITS.codeMax + 1) }, "code", /too long/],
    ["an empty problem", { problem: "" }, "problem", /Describe the problem/],
    ["a too-short problem", { problem: "broken" }, "problem", /at least 10/],
    ["an oversized problem", { problem: "x".repeat(LIMITS.problemMax + 1) }, "problem", /under 4000/],
  ])("flags %s", (_label, patch, field, message) => {
    const errors = validateDebug({ ...base, ...patch });
    expect(errors[field as "code" | "problem"]).toMatch(message);
  });

  it("accepts code exactly at the limit", () => {
    expect(validateDebug({ ...base, code: "x".repeat(LIMITS.codeMax) })).toEqual({});
  });
});

describe("parseDebugResponse", () => {
  const fixed = "numbers = [10, 20, 30]\n\nfor i in range(len(numbers)):\n\tprint(numbers[i])\n";
  const diagnosed = {
    outcome: "diagnosed",
    diagnosis: "The loop asks for one more item than the list has.",
    explanation: "range(4) gives 0, 1, 2 and 3.\n\nThe list only has positions 0, 1 and 2.",
    confirmed: ["The list has three items."],
    hypotheses: [],
    missingInfo: [],
    correctedCode: { language: "python", code: fixed },
    changes: [{ change: "range(4) became range(len(numbers))", reason: "It always matches the list length." }],
    nextSteps: ["Run it again and check that it prints three numbers."],
  };
  const needsMore = {
    outcome: "needs_more_info",
    diagnosis: "I can't tell yet why the result is wrong.",
    explanation: "The code looks valid, so the problem depends on the input.",
    confirmed: [],
    hypotheses: ["The input may contain spaces."],
    missingInfo: ["The exact input you typed."],
    correctedCode: null,
    changes: [],
    nextSteps: ["Print the input before using it."],
  };

  it("accepts a diagnosed answer and keeps corrected code byte for byte", () => {
    const parsed = parseDebugResponse(diagnosed, "python");
    expect(parsed).toEqual({ mode: "debug", ...diagnosed });
    expect(parsed!.correctedCode!.code).toBe(fixed);
  });

  it("accepts an answer that needs more information, without corrected code", () => {
    const parsed = parseDebugResponse(needsMore, "python");
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty("correctedCode");
    expect(parsed!.missingInfo).toEqual(["The exact input you typed."]);
  });

  it("accepts a diagnosis without corrected code", () => {
    expect(parseDebugResponse({ ...diagnosed, correctedCode: null, changes: [] }, "python")).not.toBeNull();
  });

  it("allows any language when the student chose Other", () => {
    expect(parseDebugResponse({ ...diagnosed, correctedCode: { language: "javascript", code: "x" } }, "other")).not.toBeNull();
  });

  it("drops unexpected keys", () => {
    expect(parseDebugResponse({ ...diagnosed, executed: true }, "python")).not.toHaveProperty("executed");
  });

  const L = DEBUG_OUTPUT_LIMITS;
  it.each([
    ["an unknown outcome", { ...diagnosed, outcome: "fixed" }],
    ["needs_more_info without missing information", { ...needsMore, missingInfo: [] }],
    ["needs_more_info with corrected code", { ...needsMore, correctedCode: diagnosed.correctedCode, changes: diagnosed.changes }],
    ["corrected code without explained changes", { ...diagnosed, changes: [] }],
    ["corrected code in another language", { ...diagnosed, correctedCode: { language: "java", code: "x" } }],
    ["corrected code in an unknown language", { ...diagnosed, correctedCode: { language: "rust", code: "x" } }],
    ["empty corrected code", { ...diagnosed, correctedCode: { language: "python", code: "  " } }],
    ["oversized corrected code", { ...diagnosed, correctedCode: { language: "python", code: "x".repeat(L.correctedCodeMax + 1) } }],
    ["an oversized diagnosis", { ...diagnosed, diagnosis: "x".repeat(L.diagnosisMax + 1) }],
    ["an empty explanation", { ...diagnosed, explanation: "" }],
    ["too many hypotheses", { ...diagnosed, hypotheses: Array(L.listMax + 1).fill("maybe") }],
    ["a malformed change", { ...diagnosed, changes: [{ change: "x" }] }],
    ["too many changes", { ...diagnosed, changes: Array(L.changesMax + 1).fill(diagnosed.changes[0]) }],
    ["no next steps", { ...diagnosed, nextSteps: [] }],
    ["an oversized list item", { ...diagnosed, confirmed: ["x".repeat(L.itemMax + 1)] }],
    ["a non-object", "The bug is on line 4."],
  ])("rejects %s", (_label, value) => {
    expect(parseDebugResponse(value, "python")).toBeNull();
  });
});

// --------------------------------------------------------------- Practice ----

describe("validatePractice", () => {
  const starter = "def greet(name):\n    # Your code here\n    pass\n";
  const base = { mode: "practice" as const, exerciseId: "greet-user", language: "python" as const, hintsOpened: 0 };

  it("accepts a changed solution", () => {
    expect(validatePractice({ ...base, solution: 'def greet(name):\n    return f"Hello, {name}!"' }, starter)).toEqual({});
  });

  it.each([
    ["an empty solution", "", /Write your solution/],
    ["a whitespace-only solution", " \n\t ", /Write your solution/],
    ["the unchanged starter code", starter.trimEnd(), /still the starter code/],
    ["an oversized solution", "x".repeat(LIMITS.solutionMax + 1), /too long/],
  ])("rejects %s", (_label, solution, message) => {
    expect(validatePractice({ ...base, solution }, starter).solution).toMatch(message);
  });
});
