import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/assistant/validation";
import { EXERCISES } from "@/lib/exercises";
import { MAX_SAVES_PER_CALL, parsePracticeSaves } from "@/lib/practice/progress";

// Every migration in the order they run, so later ones override earlier ones.
const MIGRATIONS_DIR = new URL("../../../supabase/migrations/", import.meta.url);
const MIGRATION = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(new URL(name, MIGRATIONS_DIR), "utf8"))
  .join("\n");

describe("the database's exercise list", () => {
  it("matches the exercises in the code", () => {
    const match = [...MIGRATION.matchAll(/check \(exercise_id in \(([^)]*)\)\)/g)].at(-1);
    const ids = match?.[1].match(/'([^']+)'/g)?.map((quoted) => quoted.slice(1, -1));
    expect(ids?.sort()).toEqual(EXERCISES.map((ex) => ex.id).sort());
  });

  it("allows drafts as long as the editor does", () => {
    expect(MIGRATION).toContain(`check (char_length(draft) <= ${LIMITS.solutionMax})`);
  });
});

describe("parsePracticeSaves", () => {
  const fizzbuzz = EXERCISES.find((ex) => ex.id === "fizzbuzz")!;

  it("accepts a draft save and a checked save", () => {
    const saves = [
      { exerciseId: "fizzbuzz", draft: "for (;;) {}", hintsUsed: 1 },
      { exerciseId: "sum-list", draft: "def total(xs): ...", hintsUsed: 0, checked: true },
    ];
    expect(parsePracticeSaves(saves)).toEqual(saves);
  });

  it("drops unknown keys and a false `checked`", () => {
    expect(parsePracticeSaves([{ exerciseId: "fizzbuzz", draft: "", hintsUsed: 0, checked: false, solved: true }]))
      .toEqual([{ exerciseId: "fizzbuzz", draft: "", hintsUsed: 0 }]);
  });

  it.each([
    ["not an array", { exerciseId: "fizzbuzz" }],
    ["an empty list", []],
    ["too many saves", Array.from({ length: MAX_SAVES_PER_CALL + 1 }, () => ({ exerciseId: "fizzbuzz", draft: "", hintsUsed: 0 }))],
    ["an unknown exercise", [{ exerciseId: "made-up", draft: "", hintsUsed: 0 }]],
    ["a draft that is too long", [{ exerciseId: "fizzbuzz", draft: "x".repeat(LIMITS.solutionMax + 1), hintsUsed: 0 }]],
    ["more hints than the exercise has", [{ exerciseId: "fizzbuzz", draft: "", hintsUsed: fizzbuzz.hints.length + 1 }]],
    ["negative hints", [{ exerciseId: "fizzbuzz", draft: "", hintsUsed: -1 }]],
    ["fractional hints", [{ exerciseId: "fizzbuzz", draft: "", hintsUsed: 1.5 }]],
    ["a non-boolean checked", [{ exerciseId: "fizzbuzz", draft: "", hintsUsed: 0, checked: "yes" }]],
  ])("rejects %s", (_label, value) => {
    expect(parsePracticeSaves(value)).toBeNull();
  });
});
