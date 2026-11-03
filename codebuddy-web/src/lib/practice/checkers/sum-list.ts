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

const CASES: { list: number[]; expected: number; label: string }[] = [
  { list: [4, 8, 15], expected: 27, label: "The example list" },
  { list: [], expected: 0, label: "An empty list" },
  { list: [5], expected: 5, label: "A single number" },
  { list: [-3, 10, 0], expected: 7, label: "Negative numbers and zero" },
];

type Update = { op: "add" | "sub" | "mul" | "set"; source: "item" } | { op: "add"; source: number };

interface SumModel {
  start: number;
  float: boolean;
  update: Update;
  returnInLoop: boolean;
  returnAfterLoop: boolean;
}

/**
 * Recognises the accumulator pattern from the hints:
 *
 *     result = 0
 *     for number in numbers:          (or: for i in range(len(numbers)):)
 *         result += number            (or a modelled mistake such as result = number)
 *     return result
 *
 * Returns `null` for anything else (while loops, recursion, reduce, …).
 */
function sumModel(scan: ScannedSource, lines: PyLine[], fn: PyFunction): SumModel | null {
  const param = fn.params[0];
  const body = statements(fn, scan);
  if (!param || body.length < 3 || !boundOnce(lines, "total")) return null;
  const [init, loop, ...rest] = body;
  const base = init.indent;
  const compact = (line: PyLine) => line.text.replace(/\s+/g, "");

  const start = /^([A-Za-z_]\w*)=(-?\d+(?:\.\d*)?)$/.exec(compact(init));
  if (!start || loop.indent !== base) return null;
  const acc = start[1];

  const header = /^for\s+([A-Za-z_]\w*)\s+in\s+(.+):$/.exec(loop.text);
  if (!header) return null;
  const variable = header[1];
  const iterable = header[2].replace(/\s+/g, "");
  let item: string;
  if (iterable === param) item = variable;
  else if (iterable === `range(len(${param}))` || iterable === `range(0,len(${param}))`) item = `${param}[${variable}]`;
  else return null;

  // The loop's block, then whatever follows it at the function's own level.
  const split = rest.findIndex((line) => line.indent <= base);
  const inLoop = split === -1 ? rest : rest.slice(0, split);
  const after = split === -1 ? [] : rest.slice(split);
  if (inLoop.length < 1 || inLoop.length > 2 || inLoop.some((line) => line.indent !== inLoop[0].indent)) {
    return null;
  }
  if (after.some((line) => line.indent !== base)) return null;

  const forms: [string, Update][] = [
    [`${acc}+=${item}`, { op: "add", source: "item" }],
    [`${acc}=${acc}+${item}`, { op: "add", source: "item" }],
    [`${acc}=${item}+${acc}`, { op: "add", source: "item" }],
    [`${acc}-=${item}`, { op: "sub", source: "item" }],
    [`${acc}*=${item}`, { op: "mul", source: "item" }],
    [`${acc}=${item}`, { op: "set", source: "item" }],
  ];
  const statement = compact(inLoop[0]);
  let update = forms.find(([text]) => text === statement)?.[1];
  const constant = new RegExp(`^${acc}(?:\\+=|=${acc}\\+)(\\d+)$`).exec(statement);
  if (!update && constant) update = { op: "add", source: Number(constant[1]) };
  if (!update) return null;

  const returnsAcc = (line: PyLine | undefined) => line !== undefined && compact(line) === `return${acc}`;
  if (inLoop.length === 2 && !returnsAcc(inLoop[1])) return null;
  if (after.length > 1 || (after.length === 1 && !returnsAcc(after[0]))) return null;

  return {
    start: Number(start[2]),
    float: start[2].includes("."),
    update,
    returnInLoop: inLoop.length === 2,
    returnAfterLoop: after.length === 1,
  };
}

/** What `total(list)` returns under the model; `null` stands for None. */
function runModel(model: SumModel, list: number[]): number | null {
  let acc = model.start;
  for (const value of list) {
    const operand = model.update.source === "item" ? value : model.update.source;
    if (model.update.op === "add") acc += operand;
    else if (model.update.op === "sub") acc -= operand;
    else if (model.update.op === "mul") acc *= operand;
    else acc = operand;
    if (model.returnInLoop) return acc;
  }
  return model.returnAfterLoop ? acc : null;
}

function show(value: number | null, float: boolean): string {
  if (value === null) return "None";
  return float && Number.isInteger(value) ? `${value}.0` : String(value);
}

const SUM_CALL = /(^|[^\w.])sum\s*\(|\bfsum\s*\(/;

export function checkSumList(code: string): CheckerOutput {
  const scan = scanPython(code);
  if (scan.error) return unreadable(scan.error);
  const lines = pythonLines(scan);
  const { checks, fn } = checkPythonFunction(scan, lines, { name: "total", param: "numbers" });
  const cases = CASES.map(({ list, label, expected }) => ({
    label,
    call: `total([${list.join(", ")}])`,
    expected: String(expected),
  }));
  if (!fn) return { checks, tests: testsWithoutFunction(checks, cases) };

  const sumCall = SUM_CALL.exec(scan.masked);
  checks.push(
    sumCall
      ? {
          id: "no-sum",
          label: "Doesn’t use the built-in sum()",
          status: "fail",
          detail: `Line ${lineAt(code, sumCall.index + sumCall[1].length)} calls sum().`,
          hint: "This exercise is about adding the numbers up yourself. Start a running total at 0 and add each number to it.",
        }
      : { id: "no-sum", label: "Doesn’t use the built-in sum()", status: "pass" },
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

  const model = topLevelSupported(scan, lines, fn) ? sumModel(scan, lines, fn) : null;
  if (!model) return { checks, tests: unverifiedTests(cases) };

  const tests: TestCaseResult[] = CASES.map(({ list, expected }, i) => {
    const value = runModel(model, list);
    return { ...cases[i], actual: show(value, model.float), passed: value === expected };
  });
  const emptyFails = tests[1].passed === false;
  return {
    checks,
    tests,
    testHint: emptyFails
      ? "What does your function give back for an empty list? The value you start with matters."
      : "Follow your loop by hand for [4, 8, 15]: write down the running total after each number.",
  };
}
