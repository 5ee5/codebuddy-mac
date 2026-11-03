"use server";

import { getSignedInUser, getSupabase } from "@/lib/auth/server";
import { getExercise } from "@/lib/exercises";
import { checkAnswer } from "@/lib/practice/check";
import { parsePracticeSaves, type PracticeProgress } from "@/lib/practice/progress";

/*
 * Practice progress for signed-in students. Practice itself works without an
 * account; these actions only add saving. Each action acts as the signed-in
 * user, so the database only ever reads or writes their own rows.
 */

function logDbFailure(action: string, code: string | undefined): void {
  console.error("[db]", action, code ?? "-");
}

export type ProgressLoad =
  | { signedIn: false }
  | { signedIn: true; progress: PracticeProgress[] | null };

/** The student's saved progress, or `signedIn: false`. `progress` is `null` if it couldn't be loaded. */
export async function loadPracticeProgress(): Promise<ProgressLoad> {
  const user = await getSignedInUser();
  const supabase = user && (await getSupabase());
  if (!supabase) return { signedIn: false };

  const { data, error } = await supabase
    .from("practice_progress")
    .select("exercise_id, draft, hints_used, solved_at");
  if (error) {
    logDbFailure("practice-load", error.code);
    return { signedIn: true, progress: null };
  }
  return {
    signedIn: true,
    progress: data
      .filter((row) => getExercise(row.exercise_id))
      .map((row) => ({
        exerciseId: row.exercise_id,
        draft: row.draft,
        hintsUsed: row.hints_used,
        solved: row.solved_at !== null,
      })),
  };
}

/**
 * Saves drafts and hints for one or more exercises. When a draft was just
 * checked, the verdict is worked out here again from the code, so the browser
 * can't simply claim an exercise was solved through this action.
 */
export async function savePracticeProgress(input: unknown): Promise<boolean> {
  const saves = parsePracticeSaves(input);
  if (!saves) return false;
  const user = await getSignedInUser();
  const supabase = user && (await getSupabase());
  if (!user || !supabase) return false;

  const results = await Promise.all(
    saves.map((save) => {
      const exercise = getExercise(save.exerciseId)!;
      const row = {
        user_id: user.id,
        exercise_id: save.exerciseId,
        draft: save.draft,
        hints_used: save.hintsUsed,
        // Left out when not checked, so the last verdict stays as it was.
        ...(save.checked ? { last_verdict: checkAnswer(exercise, save.draft.trimEnd()).verdict } : {}),
      };
      return supabase.from("practice_progress").upsert(row, { onConflict: "user_id,exercise_id" });
    }),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    logDbFailure("practice-save", failed.error.code);
    return false;
  }
  return true;
}
