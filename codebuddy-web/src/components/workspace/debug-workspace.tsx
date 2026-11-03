"use client";

import { useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { ResponsePanel } from "@/components/response-panel";
import { CodeEditor } from "@/components/ui/code-editor";
import { Field, Select } from "@/components/ui/field";
import { buttonGhost, buttonSecondary, panel } from "@/components/ui/styles";
import { FormFooter } from "@/components/workspace/form-footer";
import { askDebug } from "@/lib/assistant/client";
import type { DebugRequest, FieldErrors, ProgrammingLanguage } from "@/lib/assistant/types";
import { LIMITS, validateDebug } from "@/lib/assistant/validation";
import {
  canRetry,
  debugSession,
  initialDebugSession,
  type DebugEvent,
  type DebugSession,
} from "@/lib/debug-session";
import { LANGUAGE_EXTENSIONS, LANGUAGE_LABELS, LANGUAGES } from "@/lib/languages";
import { getMode } from "@/lib/modes";

const mode = getMode("debug");

const EXAMPLE = {
  language: "python" as ProgrammingLanguage,
  code: `numbers = [10, 20, 30]

for i in range(4):
    print(numbers[i])
`,
  problem: `Traceback (most recent call last):
  File "main.py", line 4, in <module>
    print(numbers[i])
IndexError: list index out of range`,
};

function focusFirstInvalid(errors: FieldErrors<DebugRequest>) {
  const id = errors.code ? "debug-code" : errors.problem ? "debug-problem" : null;
  if (id) document.getElementById(id)?.focus();
  return id !== null;
}

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span className={`font-mono text-xs tabular-nums ${length > max ? "text-danger" : "text-muted"}`}>
      {length.toLocaleString("en")}/{max.toLocaleString("en")}
    </span>
  );
}

export function DebugWorkspace() {
  const [language, setLanguage] = useState<ProgrammingLanguage>("python");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // Request lifecycle (see lib/debug-session). The ref always holds the latest
  // state, so a double click in the same frame can't send twice.
  const [session, setSession] = useState<DebugSession>(initialDebugSession);
  const sessionRef = useRef(session);
  const inFlight = useRef<AbortController>(null);

  function apply(event: DebugEvent): DebugSession | null {
    const next = debugSession(sessionRef.current, event);
    if (next === sessionRef.current) return null;
    sessionRef.current = next;
    setSession(next);
    return next;
  }

  const request: DebugRequest = {
    mode: "debug",
    language,
    code: code.trimEnd(),
    problem: problem.trim(),
  };
  // Client errors appear after the first submit attempt, then update live.
  // A server message stays only while the field still holds what was sent.
  const errors = submitted ? validateDebug(request) : {};
  const sent = session.request;
  const serverErrors = session.result?.status === "error" ? session.result.fieldErrors : undefined;
  const codeError = errors.code ?? (sent?.code === request.code ? serverErrors?.code : undefined);
  const problemError =
    errors.problem ?? (sent?.problem === request.problem ? serverErrors?.problem : undefined);

  async function send(next: DebugSession) {
    if (!next.request) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const result = await askDebug(next.request, controller.signal);
    // Cleared while waiting: drop the late result.
    if (controller.signal.aborted) return;
    inFlight.current = null;

    if (!apply({ type: "settled", attempt: next.attempt, result })) return;
    if (!(result.status === "error" && result.fieldErrors && focusFirstInvalid(result.fieldErrors))) {
      panelRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sessionRef.current.phase === "pending") return;
    setSubmitted(true);
    if (focusFirstInvalid(validateDebug(request))) return;
    const next = apply({ type: "submit", request });
    if (next) void send(next);
  }

  function handleRetry() {
    const next = apply({ type: "retry" });
    if (next) void send(next);
  }

  /** Clear and "Start a new debug session": empty form, no answer, same language. */
  function startOver() {
    // The server may still finish (and bill) an aborted request; its answer is discarded.
    inFlight.current?.abort();
    inFlight.current = null;
    apply({ type: "reset" });
    setCode("");
    setProblem("");
    setSubmitted(false);
  }

  function loadExample() {
    setLanguage(EXAMPLE.language);
    setCode(EXAMPLE.code);
    setProblem(EXAMPLE.problem);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8">
      <form noValidate onSubmit={handleSubmit} className={panel}>
        <div className="flex flex-col gap-7 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="sm:w-60">
              <Field id="debug-language" label="Programming language">
                {(props) => (
                  <Select
                    {...props}
                    name="language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as ProgrammingLanguage)}
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {LANGUAGE_LABELS[lang]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <button type="button" onClick={loadExample} className={buttonSecondary}>
              <Icon name="lightbulb" className="size-4" />
              Load an example
            </button>
          </div>

          <Field
            id="debug-code"
            label="Your code"
            hint="Paste the smallest piece of code that shows the problem. Tab moves to the next field, so indent with spaces."
            error={codeError}
            aside={<Counter length={code.trimEnd().length} max={LIMITS.codeMax} />}
          >
            {(props) => (
              <CodeEditor
                {...props}
                name="code"
                rows={10}
                title={`main.${LANGUAGE_EXTENSIONS[language]}`}
                language={LANGUAGE_LABELS[language]}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={"numbers = [1, 2, 3]\nprint(numbers[3])"}
              />
            )}
          </Field>

          <Field
            id="debug-problem"
            label="Describe the problem"
            hint="Paste the full error message, including the line number, or say what you expected to happen and what happened instead."
            error={problemError}
            aside={<Counter length={problem.trim().length} max={LIMITS.problemMax} />}
          >
            {(props) => (
              <CodeEditor
                {...props}
                name="problem"
                rows={4}
                title="error or description"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder="IndexError: list index out of range"
              />
            )}
          </Field>
        </div>

        <FormFooter
          pending={session.phase === "pending"}
          label={mode.submitLabel}
          pendingLabel="Debugging…"
          secondary={
            <button type="button" onClick={startOver} className={buttonGhost}>
              <Icon name="reset" className="size-4" />
              Clear
            </button>
          }
        />
      </form>

      <ResponsePanel
        ref={panelRef}
        mode={mode}
        result={session.result}
        pending={session.phase === "pending"}
        onRetry={canRetry(session) ? handleRetry : undefined}
        onNewSession={
          session.phase === "answered"
            ? () => {
                startOver();
                document.getElementById("debug-code")?.focus();
              }
            : undefined
        }
      />
    </div>
  );
}
