import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResponsePanel } from "@/components/response-panel";
import type { AssistantResult, DebugRequest, LearnRequest } from "@/lib/assistant/types";
import { getExercise } from "@/lib/exercises";
import { getMode } from "@/lib/modes";
import { checkAnswer } from "@/lib/practice/check";
import { accessibleText } from "@/test/markup";

const debug = getMode("debug");
const learn = getMode("learn");
const practice = getMode("practice");
const noop = () => {};

const debugAnswer: AssistantResult<DebugRequest> = {
  status: "answered",
  mode: "debug",
  model: "claude-sonnet-5-5",
  createdAt: "2026-10-24T18:43:26.000Z",
  response: {
    mode: "debug",
    outcome: "diagnosed",
    diagnosis: "Off by one.",
    explanation: "range(4) is too long.",
    confirmed: [],
    hypotheses: [],
    missingInfo: [],
    changes: [],
    nextSteps: ["Use range(3)."],
  },
};

const learnAnswer: AssistantResult<LearnRequest> = {
  status: "answered",
  mode: "learn",
  model: "claude-sonnet-5-5",
  createdAt: "2026-10-24T18:43:26.000Z",
  response: { mode: "learn", explanation: "A loop repeats code.", keyPoints: ["Loops repeat."], followUpQuestions: [] },
};

const failure = (code: "unavailable" | "invalid_request"): AssistantResult<DebugRequest> => ({
  status: "error",
  code,
  message: "The AI tutor is unavailable right now.",
});

function text(props: Partial<Parameters<typeof ResponsePanel>[0]> = {}) {
  return accessibleText(renderToStaticMarkup(<ResponsePanel mode={debug} pending={false} {...props} />));
}

describe("ResponsePanel for Debug", () => {
  it("explains the empty state with the Debug button and sections", () => {
    const t = text();
    expect(t).toContain("No code sent yet");
    expect(t).toContain("Debug my code");
    expect(t).toContain("Your code and description are sent to Claude");
    for (const section of ["Diagnosis", "Explanation", "Corrected code", "Changes explained", "Next steps"]) {
      expect(t).toContain(section);
    }
  });

  it("shows a loading state and marks the panel busy", () => {
    const html = renderToStaticMarkup(<ResponsePanel mode={debug} pending />);
    expect(html).toContain('aria-busy="true"');
    expect(accessibleText(html)).toContain("CodeBuddy is reading your code");
    expect(accessibleText(html)).toContain("Thinking");
  });

  it("shows the Debug answer and a way to start a new session", () => {
    const t = text({ result: debugAnswer, onNewSession: noop });
    expect(t).toContain("Likely problem");
    expect(t).toContain("Start a new debug session");
    expect(t).toContain("CodeBuddy’s answer is ready.");
  });

  it("hides the new-session button when not offered", () => {
    expect(text({ result: debugAnswer })).not.toContain("Start a new debug session");
  });

  it("shows an error with Try again when retry is offered", () => {
    const t = text({ result: failure("unavailable"), onRetry: noop });
    expect(t).toContain("No answer this time");
    expect(t).toContain("The AI tutor is unavailable right now.");
    expect(t).toContain("Try again");
  });

  it("shows no Try again when retry is not offered (e.g. invalid input)", () => {
    expect(text({ result: failure("invalid_request") })).not.toContain("Try again");
  });
});

describe("ResponsePanel for Learn (unchanged)", () => {
  it("keeps the Learn empty state wording", () => {
    const t = accessibleText(renderToStaticMarkup(<ResponsePanel mode={learn} pending={false} />));
    expect(t).toContain("No question yet");
    expect(t).toContain("Ask CodeBuddy");
    expect(t).toContain("Your question is sent to Claude");
  });

  it("renders a Learn answer with the Learn view", () => {
    const t = accessibleText(renderToStaticMarkup(<ResponsePanel mode={learn} pending={false} result={learnAnswer} />));
    expect(t).toContain("Key points");
    expect(t).not.toContain("Likely problem");
    expect(t).not.toContain("Start a new debug session");
  });
});

describe("ResponsePanel for Practice", () => {
  const practiceText = (props: Partial<Parameters<typeof ResponsePanel>[0]> = {}) =>
    accessibleText(renderToStaticMarkup(<ResponsePanel mode={practice} pending={false} {...props} />));

  it("describes local checking in the empty state", () => {
    const t = practiceText();
    expect(t).toContain("No answer checked yet");
    expect(t).toContain("Check answer");
    expect(t).toContain("without running it or sending it anywhere");
    expect(t).toContain("Your answer will include");
    for (const section of ["Verdict", "Requirements", "Test cases", "Next hint"]) expect(t).toContain(section);
    expect(t).not.toContain("isn't connected to the AI yet");
  });

  it("shows a check result and announces the verdict", () => {
    const check = checkAnswer(getExercise("greet-user")!, 'def greet(name):\n    return f"Hello, {name}!"');
    const t = practiceText({ check });
    expect(t).toContain("Checked");
    expect(t).toContain("Answer checked: Correct.");
    expect(t).toContain("Requirements");
    expect(t).not.toContain("AI not connected yet");
  });

  it("passes the stale flag through", () => {
    const check = checkAnswer(getExercise("greet-user")!, "def greet(name):\n    return name");
    expect(practiceText({ check, checkStale: true })).toContain("You’ve changed your code since this check.");
  });
});
