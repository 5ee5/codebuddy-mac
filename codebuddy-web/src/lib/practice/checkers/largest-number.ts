import { pythonLines, type PyFunction, type PyLine } from "@/lib/practice/python";
import { lineAt, scanPython, type ScannedSource } from "@/lib/practice/source";
import {
  boundOnce,
  checkPythonFunction,
  constantReturnResults,
  LOOP,
  returnInsideLoop,
  statements,
  testsWithoutFunction,
  topLevelSupported,
  unreadable,
  unverifiedTests,
  type CheckerOutput,
} from "@/lib/practice/checkers/shared";
import type { RequirementCheck, TestCaseResult } from "@/lib/practice/types";

// The exercise promises at least one number, so there is no empty-list case.
const CASES: { list: number[]; expected: number; label: string }[] = [
  { list: [3, 9, 4], expected: 9, label: "The example list" },
  { list: [-5, -2, -8], expected: -2, label: "Only negative numbers" },
  { list: [7], expected: 7, label: "A single number" },
  { list: [10, 3, 5], expected: 10, label: "The biggest comes first" },
];

/** A number together with how Python would show it, e.g. `0.0` or `-inf`. */
interface Shown {
  value: number;
  display: string;
}

function shown(value: number, float = false): Shown {
  if (value === Infinity) return { value, display: "inf" };
  if (value === -Infinity) return { value, display: "-inf" };
  return { value, display: float && Number.isInteger(value) ? `${value}.0` : String(value) };
}

/** Which numbers replace the one kept so far. */
type Keep = "bigger" | "smaller" | "every";

interface LargestModel {
  /** `null` stands for the list's first number. */
  start: Shown | null;
  /** The loop leaves out the first number: `numbers[1:]` or `range(1, len(numbers))`. */
  skipFirst: boolean;
  keep: Keep;
  returnInLoop: boolean;
  returnAfterLoop: boolean;
}

/** The starting value: a number, `float("-inf")`, or the list's first number. */
function startValue(scan: ScannedSource, line: PyLine, acc: string, param: string): Shown | null | undefined {
  const compact = line.text.replace(/\s+/g, "");
  if (compact === `${acc}=${param}[0]`) return null;
  const number = new RegExp(`^${acc}=(-?\\d+(?:\\.\\d*)?)$`).exec(compact);
  if (number) return shown(Number(number[1]), number[1].includes("."));
  // String contents are blanked in `text`, so read float("-inf") from the source.
  const source = scan.code.slice(line.start, line.start + line.text.length).replace(/\s+/g, "");
  const infinity = new RegExp(`^${acc}=(-?)float\\((["'])([-+]?)inf(?:inity)?\\2\\)$`, "i").exec(source);
  if (infinity) return shown((infinity[1] === "-") !== (infinity[3] === "-") ? -Infinity : Infinity);
  return undefined;
}

function conditions(item: string, acc: string): [string, Keep][] {
  const bare: [string, Keep][] = [
    [`${item}>${acc}`, "bigger"],
    [`${item}>=${acc}`, "bigger"],
    [`${acc}<${item}`, "bigger"],
    [`${acc}<=${item}`, "bigger"],
    [`${item}<${acc}`, "smaller"],
    [`${item}<=${acc}`, "smaller"],
    [`${acc}>${item}`, "smaller"],
    [`${acc}>=${item}`, "smaller"],
  ];
  return [...bare, ...bare.map(([text, keep]): [string, Keep] => [`(${text})`, keep])];
}

/**
 * Recognises the "biggest so far" pattern from the hints:
 *
 *     biggest = numbers[0]            (or a number, or float("-inf"))
 *     for number in numbers:          (or numbers[1:], or an index loop)
 *         if number > biggest:        (or a modelled mistake: <, or no if at all)
 *             biggest = number
 *     return biggest
 *
 * Returns `null` for anything else (while loops, else branches, sorting, …).
 */
function largestModel(scan: ScannedSource, lines: PyLine[], fn: PyFunction): LargestModel | null {
  const param = fn.params[0];
  const body = statements(fn, scan);
  if (!param || body.length < 3 || !boundOnce(lines, "largest")) return null;
  const [init, loop, ...rest] = body;
  const base = init.indent;
  const compact = (line: PyLine) => line.text.replace(/\s+/g, "");

  const target = /^([A-Za-z_]\w*)\s*=[^=]/.exec(init.text);
  if (!target || loop.indent !== base) return null;
  const acc = target[1];
  const start = startValue(scan, init, acc, param);
  if (start === undefined) return null;

  const header = /^for\s+([A-Za-z_]\w*)\s+in\s+(.+):$/.exec(loop.text);
  if (!header) return null;
  const variable = header[1];
  const iterable = header[2].replace(/\s+/g, "");
  let item: string;
  let skipFirst = false;
  if (iterable === param || iterable === `${param}[1:]`) {
    item = variable;
    skipFirst = iterable !== param;
  } else if (
    iterable === `range(len(${param}))` ||
    iterable === `range(0,len(${param}))` ||
    iterable === `range(1,len(${param}))`
  ) {
    item = `${param}[${variable}]`;
    skipFirst = iterable.startsWith("range(1,");
  } else return null;

  // The loop's block, then whatever follows it at the function's own level.
  const split = rest.findIndex((line) => line.indent <= base);
  const inLoop = split === -1 ? rest : rest.slice(0, split);
  const after = split === -1 ? [] : rest.slice(split);
  if (inLoop.length === 0 || after.some((line) => line.indent !== base)) return null;
  const blockIndent = inLoop[0].indent;

  // The update: `if <condition>:` with the assignment below it or on the same
  // line, or a bare assignment that replaces the kept number every time.
  const assign = `${acc}=${item}`;
  const first = compact(inLoop[0]);
  let keep: Keep | undefined;
  let used = 1;
  if (first === assign) keep = "every";
  for (const [condition, kind] of conditions(item, acc)) {
    if (first === `if${condition}:${assign}`) keep = kind;
    else if (first === `if${condition}:` && inLoop.length > 1 && inLoop[1].indent > blockIndent && compact(inLoop[1]) === assign) {
      keep = kind;
      used = 2;
    }
  }
  if (!keep) return null;

  const returnsAcc = (line: PyLine | undefined) => line !== undefined && compact(line) === `return${acc}`;
  const tail = inLoop.slice(used);
  if (tail.length > 1 || (tail.length === 1 && (tail[0].indent !== blockIndent || !returnsAcc(tail[0])))) {
    return null;
  }
  if (after.length > 1 || (after.length === 1 && !returnsAcc(after[0]))) return null;

  return { start, skipFirst, keep, returnInLoop: tail.length === 1, returnAfterLoop: after.length === 1 };
}

/** What `largest(list)` returns under the model; `null` stands for None. */
function runModel(model: LargestModel, list: number[]): Shown | null {
  let kept = model.start ?? shown(list[0]);
  for (const value of model.skipFirst ? list.slice(1) : list) {
    const replace =
      model.keep === "every" || (model.keep === "bigger" ? value > kept.value : value < kept.value);
    if (replace) kept = shown(value);
    if (model.returnInLoop) return kept;
  }
  return model.returnAfterLoop ? kept : null;
}

const MAX_CALL = /(^|[^\w.])max\s*\(/;

export function checkLargestNumber(code: string): CheckerOutput {
  const scan = scanPython(code);
  if (scan.error) return unreadable(scan.error);
  const lines = pythonLines(scan);
  const { checks, fn } = checkPythonFunction(scan, lines, { name: "largest", param: "numbers" });
  const cases = CASES.map(({ list, label, expected }) => ({
    label,
    call: `largest([${list.join(", ")}])`,
    expected: String(expected),
  }));
  if (!fn) return { checks, tests: testsWithoutFunction(checks, cases) };

  const maxCall = MAX_CALL.exec(scan.masked);
  checks.push(
    maxCall
      ? {
          id: "no-max",
          label: "Doesn’t use the built-in max()",
          status: "fail",
          detail: `Line ${lineAt(code, maxCall.index + maxCall[1].length)} calls max().`,
          hint: "This exercise is about finding the biggest number yourself. Keep the biggest number so far, and compare each number with it.",
        }
      : { id: "no-max", label: "Doesn’t use the built-in max()", status: "pass" },
  );

  const body = statements(fn, scan);
  if (body.some((line) => LOOP.test(line.text))) {
    const early = returnInsideLoop(body);
    const check: RequirementCheck = early
      ? {
          id: "return-after-loop",
          label: "Returns only after the loop has finished",
          status: "fail",
          detail: `The return on line ${early.line} is inside the loop, so the function stops after the first number.`,
          hint: "Indentation decides what belongs to the loop. Which lines should run once per number, and which only once at the end?",
        }
      : { id: "return-after-loop", label: "Returns only after the loop has finished", status: "pass" };
    checks.push(check);
  }

  const constant = constantReturnResults(scan, lines, fn, cases, CASES.map((c) => c.expected));
  if (constant) return { checks: [...checks, ...constant.checks], tests: constant.tests };

  const model = topLevelSupported(scan, lines, fn) ? largestModel(scan, lines, fn) : null;
  if (!model) return { checks, tests: unverifiedTests(cases) };

  const tests: TestCaseResult[] = CASES.map(({ list, expected }, i) => {
    const result = runModel(model, list);
    return { ...cases[i], actual: result?.display ?? "None", passed: result?.value === expected };
  });
  const negativesFail = tests[1].passed === false && tests.filter((t) => t.passed === false).length === 1;
  return {
    checks,
    tests,
    testHint: negativesFail
      ? "What does your function give back when every number is negative? Check that your starting value is one of the numbers in the list."
      : "Follow your loop by hand for [3, 9, 4]: write down the biggest number so far after each step.",
  };
}
