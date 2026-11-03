"use client";

import { useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { ResponsePanel } from "@/components/response-panel";
import { Field } from "@/components/ui/field";
import { RadioCards, type RadioCardOption } from "@/components/ui/radio-cards";
import { buttonGhost, control, panel } from "@/components/ui/styles";
import { FormFooter } from "@/components/workspace/form-footer";
import { askLearn } from "@/lib/assistant/client";
import type { AssistantResult, LearnRequest, LearnerLevel } from "@/lib/assistant/types";
import { hasErrors, LIMITS, validateLearn } from "@/lib/assistant/validation";
import { getMode } from "@/lib/modes";

const mode = getMode("learn");

const TOPICS = [
  { label: "Variables", question: "What is a variable, and why do programs need them?" },
  { label: "If statements", question: "How do if, elif and else work? When is each part used?" },
  { label: "Loops", question: "What is the difference between a for loop and a while loop?" },
  { label: "Functions", question: "What is a function, and what does return actually do?" },
  { label: "Lists", question: "How do lists work, and how do I add or remove items?" },
  { label: "Recursion", question: "Can you explain recursion with a very simple example?" },
] as const;

const LEVELS: readonly RadioCardOption<LearnerLevel>[] = [
  { value: "beginner", label: "Beginner", description: "I’m just starting out" },
  { value: "basics", label: "Basics", description: "I know variables and loops" },
  { value: "comfortable", label: "Comfortable", description: "I’ve written small programs" },
];

export function LearnWorkspace() {
  const [question, setQuestion] = useState("");
  const [level, setLevel] = useState<LearnerLevel>("beginner");
  const [topic, setTopic] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<AssistantResult<LearnRequest> | null>(null);
  const [pending, setPending] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const inFlight = useRef<AbortController>(null);

  const request: LearnRequest = {
    mode: "learn",
    question: question.trim(),
    level,
    ...(topic ? { topic } : {}),
  };
  // Errors appear only after the first submit attempt, then update live.
  // A server-side message is shown until the question changes.
  const serverQuestionError =
    result?.status === "error" ? result.fieldErrors?.question : undefined;
  const errors = submitted ? validateLearn(request) : {};
  const questionError = errors.question ?? serverQuestionError;
  const length = question.trim().length;

  function updateQuestion(value: string) {
    setQuestion(value);
    if (serverQuestionError) setResult(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors(validateLearn(request))) {
      setResult(null);
      document.getElementById("learn-question")?.focus();
      return;
    }
    const controller = new AbortController();
    inFlight.current = controller;
    setPending(true);
    setResult(null);
    const outcome = await askLearn(request, controller.signal);
    // Cleared while waiting: drop the late result.
    if (controller.signal.aborted) return;
    inFlight.current = null;
    setPending(false);

    setResult(outcome);
    if (outcome.status === "error" && outcome.fieldErrors?.question) {
      document.getElementById("learn-question")?.focus();
    } else {
      panelRef.current?.focus();
    }
  }

  function handleClear() {
    // The server may still finish (and bill) an aborted request; its answer is discarded.
    inFlight.current?.abort();
    inFlight.current = null;
    setPending(false);
    setQuestion("");
    setTopic(undefined);
    setSubmitted(false);
    setResult(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8">
      <form noValidate onSubmit={handleSubmit} className={panel}>
        <div className="flex flex-col gap-7 p-5 sm:p-6">
          <div>
            <p id="learn-topics-label" className="text-sm font-semibold">
              Start from a topic
            </p>
            <p id="learn-topics-hint" className="mt-1.5 text-sm leading-relaxed text-muted">
              Choosing a topic fills in an example question, replacing what you typed.
            </p>
            <div
              role="group"
              aria-labelledby="learn-topics-label"
              aria-describedby="learn-topics-hint"
              className="mt-3 flex flex-wrap gap-2"
            >
              {TOPICS.map((t) => {
                const selected = topic === t.label;
                return (
                  <button
                    key={t.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setTopic(t.label);
                      updateQuestion(t.question);
                    }}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors duration-150 sm:min-h-9 ${
                      selected
                        ? "border-mode bg-mode-soft text-mode"
                        : "border-line-strong bg-surface text-ink hover:border-line-input hover:bg-surface-2"
                    }`}
                  >
                    {selected && <Icon name="check" className="size-3.5" />}
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Field
            id="learn-question"
            label="Your question"
            hint="Be specific: say what you already know and what confuses you."
            error={questionError}
            aside={
              <span
                className={`font-mono text-xs tabular-nums ${
                  length > LIMITS.questionMax ? "text-danger" : "text-muted"
                }`}
              >
                {length}/{LIMITS.questionMax}
              </span>
            }
          >
            {(props) => (
              <textarea
                {...props}
                name="question"
                rows={5}
                value={question}
                onChange={(e) => updateQuestion(e.target.value)}
                placeholder={`For example: ${mode.examplePrompt}`}
                className={`${control} resize-y leading-relaxed`}
              />
            )}
          </Field>

          <RadioCards
            name="level"
            legend="Your level"
            hint="CodeBuddy adjusts its explanation and vocabulary to match."
            options={LEVELS}
            value={level}
            onChange={setLevel}
          />
        </div>

        <FormFooter
          pending={pending}
          label="Ask CodeBuddy"
          pendingLabel="Thinking…"
          secondary={
            <button type="button" onClick={handleClear} className={buttonGhost}>
              <Icon name="reset" className="size-4" />
              Clear
            </button>
          }
        />
      </form>

      <ResponsePanel ref={panelRef} mode={mode} result={result} pending={pending} />
    </div>
  );
}
