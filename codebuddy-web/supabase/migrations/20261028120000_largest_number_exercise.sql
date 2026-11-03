-- Adds the "Find the biggest" exercise (largest-number) to Practice progress.
-- The exercises themselves live in src/lib/exercises.ts; keep the list below
-- in sync (a test checks the newest list across all migrations).

alter table public.practice_progress
  drop constraint practice_progress_exercise_id_check;

alter table public.practice_progress
  add constraint practice_progress_exercise_id_check
    check (exercise_id in ('greet-user', 'sum-list', 'fizzbuzz', 'count-vowels', 'largest-number'));
