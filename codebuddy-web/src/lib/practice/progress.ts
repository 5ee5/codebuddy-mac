import { LIMITS } from "@/lib/assistant/validation";
import { getExercise } from "@/lib/exercises";

/*
 * What Practice saves for signed-in users, shared by the page and the Server
 * Actions. The Server Actions check everything again, because their input
 * comes from the browser.
 */

/** Saved progress for one exercise, as the page uses it. */
export interface PracticeProgress {
  exerciseId: string;
  draft: string;
  hintsUsed: number;
  solved: boolean;
}

/** One exercise's changes since the last save. */
export interface PracticeSave {
  exerciseId: string;
  draft: string;
  hintsUsed: number;
  /** The draft was just checked; the server works out the verdict itself. */
  checked?: boolean;
}

/** More than the five exercises, but small enough that one call stays cheap. */
export const MAX_SAVES_PER_CALL = 10;

export function parsePracticeSaves(value: unknown): PracticeSave[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SAVES_PER_CALL) return null;
  const saves: PracticeSave[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { exerciseId, draft, hintsUsed, checked } = item as Record<string, unknown>;
    const exercise = typeof exerciseId === "string" ? getExercise(exerciseId) : undefined;
    if (!exercise) return null;
    if (typeof draft !== "string" || draft.length > LIMITS.solutionMax) return null;
    if (!Number.isInteger(hintsUsed) || (hintsUsed as number) < 0 || (hintsUsed as number) > exercise.hints.length) {
      return null;
    }
    if (checked !== undefined && typeof checked !== "boolean") return null;
    saves.push({ exerciseId: exercise.id, draft, hintsUsed: hintsUsed as number, ...(checked ? { checked } : {}) });
  }
  return saves;
}
