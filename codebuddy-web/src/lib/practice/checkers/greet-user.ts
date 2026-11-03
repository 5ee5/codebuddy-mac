import {
  evalStringExpr,
  lineTokens,
  pyTokens,
  pythonLines,
  pythonRepr,
  type PyFunction,
  type PyLine,
} from "@/lib/practice/python";
import { scanPython, type ScannedSource } from "@/lib/practice/source";
import {
  boundOnce,
  checkPythonFunction,
  constantReturnResults,
  hasPrint,
  statements,
  testsWithoutFunction,
  topLevelSupported,
  unreadable,
  unverifiedTests,
  type CheckerOutput,
} from "@/lib/practice/checkers/shared";
import type { TestCaseResult } from "@/lib/practice/types";

const NAMES = ["Ada", "Grace Hopper", "Sam"];

const ASSIGNMENT = /^([A-Za-z_]\w*)\s*(=|\+=)(?!=)/;

/**
 * Works out what greet returns for a given name, when its body is straight-
 * line code: assignments and `+=` of string expressions, then one return.
 * Prints are ignored (they don't change the result). Returns `null` for any
 * other shape, including loops, conditions and calls to other functions.
 */
function greetModel(scan: ScannedSource, lines: PyLine[], fn: PyFunction) {
  const param = fn.params[0];
  const body = statements(fn, scan).filter((line) => !hasPrint(line));
  const last = body[body.length - 1];
  if (!param || !last || !boundOnce(lines, "greet")) return null;
  if (body.some((line) => line.indent !== body[0].indent)) return null;
  if (!/^return\b/.test(last.text)) return null;

  return (name: string): string | null => {
    const env = new Map([[param, name]]);
    for (const line of body.slice(0, -1)) {
      const match = ASSIGNMENT.exec(line.text);
      if (!match) return null;
      const tokens = pyTokens(scan, line.start + match[0].length, line.start + line.text.length);
      const value = tokens && evalStringExpr(tokens, env);
      if (value === null) return null;
      if (match[2] === "+=") {
        const current = env.get(match[1]);
        if (current === undefined) return null;
        env.set(match[1], current + value);
      } else {
        env.set(match[1], value);
      }
    }
    const tokens = lineTokens(scan, last);
    return tokens ? evalStringExpr(tokens.slice(1), env) : null;
  };
}

export function checkGreetUser(code: string): CheckerOutput {
  const scan = scanPython(code);
  if (scan.error) return unreadable(scan.error);
  const lines = pythonLines(scan);
  const { checks, fn } = checkPythonFunction(scan, lines, { name: "greet", param: "name" });
  const cases = NAMES.map((name) => ({
    label: name.includes(" ") ? "A name with a space" : `Greets ${name}`,
    call: `greet(${pythonRepr(name)})`,
    expected: pythonRepr(`Hello, ${name}!`),
  }));
  if (!fn) return { checks, tests: testsWithoutFunction(checks, cases) };

  const printed = fn.body.find(hasPrint);
  checks.push(
    printed
      ? {
          id: "no-print",
          label: "Gives the greeting back instead of printing it",
          status: "fail",
          detail: `Line ${printed.line} prints inside the function.`,
          hint: "greet should only return the greeting. Leave printing to the code that calls greet.",
        }
      : { id: "no-print", label: "Gives the greeting back instead of printing it", status: "pass" },
  );

  const constant = constantReturnResults(scan, lines, fn, cases, NAMES.map((name) => `Hello, ${name}!`));
  if (constant) return { checks: [...checks, ...constant.checks], tests: constant.tests };

  const model = topLevelSupported(scan, lines, fn) ? greetModel(scan, lines, fn) : null;
  const results = cases.map((c, i) => (model ? model(NAMES[i]) : null));
  if (results.some((value) => value === null)) return { checks, tests: unverifiedTests(cases) };

  const tests: TestCaseResult[] = cases.map((c, i) => {
    const actual = pythonRepr(results[i]);
    return { ...c, actual, passed: actual === c.expected };
  });
  const failed = tests.find((test) => !test.passed);
  return {
    checks,
    tests,
    testHint: failed
      ? failed.actual?.toLowerCase() === failed.expected.toLowerCase()
        ? "Check your capital letters: the greeting starts with a capital H."
        : "Compare your result with the expected text character by character. The comma, the space and the exclamation mark all count."
      : undefined,
  };
}
