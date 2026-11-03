"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { ResponsePanel } from "@/components/response-panel";
import { CodeBlock } from "@/components/ui/code-block";
import { CodeEditor } from "@/components/ui/code-editor";
import { Field } from "@/components/ui/field";
import { RadioCards, type RadioCardOption } from "@/components/ui/radio-cards";
import { buttonGhost, eyebrow, panel } from "@/components/ui/styles";
import { FormFooter } from "@/components/workspace/form-footer";
import type { PracticeRequest } from "@/lib/assistant/types";
import { hasErrors, validatePractice } from "@/lib/assistant/validation";
import { loginPathFor } from "@/lib/auth/paths";
import { loadPracticeProgress, savePracticeProgress } from "@/lib/db/practice-actions";
import {
  DIFFICULTY_LABELS,
  EXERCISES,
  getExercise,
  type Difficulty,
  type Exercise,
} from "@/lib/exercises";
import { LANGUAGE_EXTENSIONS, LANGUAGE_LABELS } from "@/lib/languages";
import { getMode } from "@/lib/modes";
import { checkAnswer } from "@/lib/practice/check";
import type { PracticeSave } from "@/lib/practice/progress";
import type { PracticeCheck } from "@/lib/practice/types";

const mode = getMode("practice");

const DIFFICULTY_LEVEL: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

/** Three small bars plus a text label; the bars are decorative. */
function DifficultyMeter({ difficulty }: { difficulty: Difficulty }) {
  const level = DIFFICULTY_LEVEL[difficulty];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-medium tracking-wide text-muted uppercase">
      <span aria-hidden="true" className="flex items-end gap-0.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`w-1 rounded-sm ${n <= level ? "bg-mode" : "bg-line-strong"}`}
            style={{ height: `${4 + n * 3}px` }}
          />
        ))}
      </span>
      <span className="sr-only">Difficulty: </span>
      {DIFFICULTY_LABELS[difficulty]}
    </span>
  );
}

function exerciseOptions(solved: ReadonlySet<string>): RadioCardOption<string>[] {
  return EXERCISES.map((ex) => ({
    value: ex.id,
    label: ex.title,
    description: solved.has(ex.id) ? (
      <span className="inline-flex items-center gap-1.5">
        {LANGUAGE_LABELS[ex.language]} ·
        <Icon name="check" className="size-3.5 text-mode" />
        Solved
      </span>
    ) : (
      LANGUAGE_LABELS[ex.language]
    ),
    meta: <DifficultyMeter difficulty={ex.difficulty} />,
  }));
}

/** Wait this long after the last change before saving a draft. */
const SAVE_DELAY_MS = 1500;

type Account = "unknown" | "signedOut" | "signedIn";
type SaveState = "idle" | "saving" | "saved" | "error" | "loadError";

/** Tells the student whether their work is kept, in one quiet line. */
function SaveStatus({ account, state }: { account: Account; state: SaveState }) {
  let text: ReactNode = null;
  if (account === "signedOut") {
    text = (
      <>
        Your work is kept only while this page is open.{" "}
        <Link href={loginPathFor("/practice")} className="font-semibold text-ink underline underline-offset-4">
          Sign in
        </Link>{" "}
        to save your progress.
      </>
    );
  } else if (account === "signedIn") {
    text = {
      idle: "Your progress is saved to your account.",
      saving: "Saving…",
      saved: "Saved to your account.",
      error: "Couldn’t save your progress. It will try again when you make a change.",
      loadError: "Couldn’t load your saved progress. Try reloading the page.",
    }[state];
  }
  return (
    <p aria-live="polite" className="mt-2 min-h-5 text-xs leading-relaxed text-muted">
      {text}
    </p>
  );
}

export function PracticeWorkspace() {
  const [exerciseId, setExerciseId] = useState(EXERCISES[0].id);
  // One draft per exercise, so switching exercises never throws work away.
  const [solutions, setSolutions] = useState<Record<string, string>>({});
  const [hintsOpened, setHintsOpened] = useState<Record<string, number[]>>({});
  const [submitted, setSubmitted] = useState(false);
  // The last check for each exercise, kept alongside its draft.
  const [checks, setChecks] = useState<Record<string, PracticeCheck | undefined>>({});
  const panelRef = useRef<HTMLElement>(null);

  // Saving for signed-in students: changes are collected per exercise and
  // sent together a moment after the student stops typing.
  const [account, setAccount] = useState<Account>("unknown");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [solvedIds, setSolvedIds] = useState<ReadonlySet<string>>(new Set());
  const pendingSaves = useRef(new Map<string, PracticeSave>());
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const flushSaves = useCallback(async () => {
    saveTimer.current = null;
    const saves = [...pendingSaves.current.values()];
    if (saves.length === 0) return;
    pendingSaves.current.clear();
    setSaveState("saving");
    const ok = await savePracticeProgress(saves).catch(() => false);
    if (!ok) {
      // Keep them for the next attempt, unless newer changes replaced them.
      for (const save of saves) {
        if (!pendingSaves.current.has(save.exerciseId)) pendingSaves.current.set(save.exerciseId, save);
      }
    }
    setSaveState(ok ? "saved" : "error");
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadPracticeProgress()
      .then((result) => {
        if (cancelled) return;
        if (!result.signedIn) {
          setAccount("signedOut");
          return;
        }
        setAccount("signedIn");
        const progress = result.progress;
        if (!progress) {
          setSaveState("loadError");
          return;
        }
        // Anything typed before the saved progress arrived wins.
        setSolutions((prev) => {
          const next = { ...prev };
          for (const p of progress) if (next[p.exerciseId] === undefined && p.draft) next[p.exerciseId] = p.draft;
          return next;
        });
        setHintsOpened((prev) => {
          const next = { ...prev };
          for (const p of progress) {
            const saved = Array.from({ length: p.hintsUsed }, (_, i) => i);
            next[p.exerciseId] = [...new Set([...(prev[p.exerciseId] ?? []), ...saved])];
          }
          return next;
        });
        setSolvedIds((prev) => new Set([...prev, ...progress.filter((p) => p.solved).map((p) => p.exerciseId)]));
      })
      // Couldn't reach the server: Practice still works, just without saving.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Send anything still waiting when the student leaves the page.
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void flushSaves();
      }
    },
    [flushSaves],
  );

  function queueSave(save: PracticeSave, immediately = false) {
    if (account !== "signedIn") return;
    const previous = pendingSaves.current.get(save.exerciseId);
    const checked = save.checked || previous?.checked;
    pendingSaves.current.set(save.exerciseId, { ...save, ...(checked ? { checked } : {}) });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSaves, immediately ? 0 : SAVE_DELAY_MS);
  }

  const exercise: Exercise = getExercise(exerciseId) ?? EXERCISES[0];
  const solution = solutions[exercise.id] ?? exercise.starterCode;
  const opened = hintsOpened[exercise.id] ?? [];
  const extension = LANGUAGE_EXTENSIONS[exercise.language];

  const request: PracticeRequest = {
    mode: "practice",
    exerciseId: exercise.id,
    language: exercise.language,
    solution: solution.trimEnd(),
    hintsOpened: opened.length,
  };
  const errors = submitted ? validatePractice(request, exercise.starterCode) : {};
  const check = checks[exercise.id] ?? null;

  function setCheck(value: PracticeCheck | undefined) {
    setChecks((prev) => ({ ...prev, [exercise.id]: value }));
  }

  function setSolution(value: string) {
    setSolutions((prev) => ({ ...prev, [exercise.id]: value }));
    queueSave({ exerciseId: exercise.id, draft: value, hintsUsed: opened.length });
  }

  function markHintOpened(index: number) {
    if (opened.includes(index)) return;
    setHintsOpened((prev) => {
      const current = prev[exercise.id] ?? [];
      return current.includes(index) ? prev : { ...prev, [exercise.id]: [...current, index] };
    });
    queueSave({ exerciseId: exercise.id, draft: solution, hintsUsed: opened.length + 1 });
  }

  /** Checks the answer in the browser by reading it; the code is never run or sent. */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors(validatePractice(request, exercise.starterCode))) {
      setCheck(undefined);
      document.getElementById("practice-solution")?.focus();
      return;
    }
    const result = checkAnswer(exercise, request.solution);
    setCheck(result);
    if (result.verdict === "correct") setSolvedIds((prev) => new Set([...prev, exercise.id]));
    queueSave({ exerciseId: exercise.id, draft: solution, hintsUsed: opened.length, checked: true }, true);
    panelRef.current?.focus();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8">
      <form noValidate onSubmit={handleSubmit} className={panel}>
        <div className="divide-y divide-line">
          <div className="p-5 sm:p-6">
            <RadioCards
              name="exercise"
              legend="Choose an exercise"
              options={exerciseOptions(solvedIds)}
              value={exercise.id}
              onChange={(id) => {
                setExerciseId(id);
                setSubmitted(false);
              }}
              columns="sm:grid-cols-2"
            />
          </div>

          <article aria-labelledby="practice-exercise-title" className="flex flex-col gap-6 p-5 sm:p-6">
            <div>
              <p className={eyebrow}>Exercise brief</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 id="practice-exercise-title" className="font-display text-2xl font-semibold">
                  {exercise.title}
                </h2>
                <DifficultyMeter difficulty={exercise.difficulty} />
                <span className="font-mono text-[11px] font-medium tracking-wide text-muted uppercase">
                  <span className="sr-only">Language: </span>
                  {LANGUAGE_LABELS[exercise.language]}
                </span>
              </div>
              <p className="mt-3 leading-relaxed text-muted">{exercise.description}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold">Your solution should</h3>
              <ul className="mt-2 flex flex-col gap-2 text-sm leading-relaxed">
                {exercise.requirements.map((req) => (
                  <li key={req} className="flex gap-2.5">
                    <Icon name="check" className="mt-0.5 size-4 shrink-0 text-mode" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold">Stuck? Open a hint</h3>
                <p className="font-mono text-xs text-muted tabular-nums">
                  {opened.length} of {exercise.hints.length} used
                </p>
              </div>
              {/* Keyed by exercise so open/closed state resets per exercise. */}
              <div key={exercise.id} className="mt-2 divide-y divide-line border-y border-line">
                {exercise.hints.map((hint, i) => (
                  <details
                    key={hint}
                    onToggle={(e) => {
                      if (e.currentTarget.open) markHintOpened(i);
                    }}
                    className="group"
                  >
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-medium transition-colors hover:text-mode [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2">
                        <Icon name="lightbulb" className="size-4 text-mode" />
                        Hint {i + 1}
                      </span>
                      <Icon
                        name="chevronDown"
                        className="size-4 text-muted transition-transform duration-150 group-open:rotate-180"
                      />
                    </summary>
                    <p className="pb-3 pl-6 text-sm leading-relaxed">{hint}</p>
                  </details>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Starter code</h3>
              <CodeBlock
                title={`starter.${extension}`}
                language={LANGUAGE_LABELS[exercise.language]}
                label="Starter code"
                code={exercise.starterCode}
              />
            </div>
          </article>

          <div className="p-5 sm:p-6">
            <Field
              id="practice-solution"
              label="Your solution"
              hint={`Starts from the starter code. Write ${LANGUAGE_LABELS[exercise.language]}; Tab moves to the next field, so indent with spaces.`}
              error={errors.solution}
            >
              {(props) => (
                <CodeEditor
                  {...props}
                  name="solution"
                  rows={12}
                  title={`solution.${extension}`}
                  language={LANGUAGE_LABELS[exercise.language]}
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                />
              )}
            </Field>
            <SaveStatus account={account} state={saveState} />
          </div>
        </div>

        <FormFooter
          pending={false}
          label={mode.submitLabel}
          secondary={
            <button
              type="button"
              onClick={() => {
                setSolution(exercise.starterCode);
                setSubmitted(false);
                setCheck(undefined);
              }}
              className={buttonGhost}
            >
              <Icon name="reset" className="size-4" />
              Reset to starter code
            </button>
          }
        />
      </form>

      <ResponsePanel
        ref={panelRef}
        mode={mode}
        check={check}
        checkStale={check !== null && check.checkedCode !== request.solution}
        pending={false}
      />
    </div>
  );
}
