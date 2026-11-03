import {
  isName,
  isOp,
  isPlaceholder,
  lineTokens,
  plainString,
  pythonFunctions,
  pythonRepr,
  type PyFunction,
  type PyLine,
} from "@/lib/practice/python";
import type { ScannedSource, SourceError } from "@/lib/practice/source";
import type { RequirementCheck, TestCaseResult } from "@/lib/practice/types";

/** What an exercise checker reports; `checkAnswer` turns it into a verdict. */
export interface CheckerOutput {
  checks: RequirementCheck[];
  tests: TestCaseResult[];
  /** A nudge for the first failing test, when no check explains it already. */
  testHint?: string;
}

export type Checker = (code: string) => CheckerOutput;

/** Result for code that can't be read at all (unclosed string, bracket, …). */
export function unreadable(error: SourceError): CheckerOutput {
  return {
    checks: [
      {
        id: "readable",
        label: "The code can be read",
        status: "fail",
        blocking: true,
        detail: error.message,
        hint: `Look closely at line ${error.line}: every quote and bracket needs a partner that closes it.`,
      },
    ],
    tests: [],
  };
}

/**
 * Tests whose results can't be worked out without running the code: the
 * expected values are still shown, so the learner can compare by hand.
 */
export function unverifiedTests(cases: { label: string; call: string; expected: string }[]): TestCaseResult[] {
  return cases.map((c) => ({ ...c, actual: null, passed: null }));
}

interface FunctionSpec {
  name: string;
  /** The parameter name the exercise uses, for messages only. */
  param: string;
}

export interface FunctionChecks {
  checks: RequirementCheck[];
  /** The function, once every blocking check has passed. */
  fn: PyFunction | null;
}

const RETURN_WITH_VALUE = /^return\b\s*\S/;
const PRINT_CALL = /(^|[^\w.])print\s*\(/;

export function hasPrint(line: PyLine): boolean {
  return PRINT_CALL.test(line.text);
}

/**
 * The checks every Python exercise shares: the function exists with the right
 * name and one parameter, it has real code, and it returns a value. These are
 * read reliably from the text, so they are the blocking ones.
 */
export function checkPythonFunction(
  scan: ScannedSource,
  lines: PyLine[],
  { name, param }: FunctionSpec,
): FunctionChecks {
  const defines = `Defines ${name}(${param}) with one parameter`;
  const functions = pythonFunctions(lines);
  const matches = functions.filter((fn) => fn.name === name);

  if (matches.length === 0) {
    const lambda = lines.some(
      (line) => line.indent === 0 && new RegExp(`^${name}\\s*=\\s*lambda\\b`).test(line.text),
    );
    if (lambda) {
      return {
        checks: [
          {
            id: "defines",
            label: defines,
            status: "unverified",
            detail: `${name} is written as a lambda. CodeBuddy can only check functions written with def.`,
          },
        ],
        fn: null,
      };
    }
    const other = functions[0];
    return {
      checks: [
        {
          id: "defines",
          label: defines,
          status: "fail",
          blocking: true,
          detail: other
            ? `CodeBuddy found def ${other.name}(…), but no function called ${name}.`
            : `CodeBuddy couldn’t find def ${name}(…) at the start of a line.`,
          hint: other
            ? `Check the name after def: it must be exactly ${name}. Python is case-sensitive.`
            : `Start with def ${name}(${param}): on its own line, not indented, and indent the function’s code below it.`,
        },
      ],
      fn: null,
    };
  }

  // Python keeps the last definition, so that is the one that counts.
  const fn = matches[matches.length - 1];
  const checks: RequirementCheck[] = [];
  const oneParam = fn.params.length === 1 && fn.params[0] !== null;
  checks.push(
    oneParam
      ? { id: "defines", label: defines, status: "pass" }
      : {
          id: "defines",
          label: defines,
          status: "fail",
          blocking: true,
          detail: `${name} takes ${fn.params.length === 1 ? "an unusual parameter" : `${fn.params.length} parameters`} (line ${fn.def.line}).`,
          hint: `The parentheses after ${name} list its inputs. This exercise passes in one value, so put one plain name there, such as ${param}.`,
        },
  );
  if (matches.length > 1) {
    checks.push({
      id: "defined-once",
      label: `${name} is defined only once`,
      status: "fail",
      detail: `${name} is defined ${matches.length} times. Python only keeps the last one.`,
      hint: `Delete the extra copies of ${name} so that only one is left.`,
    });
  }

  const hasCode = fn.body.some((line) => !isPlaceholder(line, scan));
  checks.push(
    hasCode
      ? { id: "has-code", label: "Has its own code in the function body", status: "pass" }
      : {
          id: "has-code",
          label: "Has its own code in the function body",
          status: "fail",
          blocking: true,
          detail:
            fn.body.length === 0
              ? `CodeBuddy couldn’t find an indented body under def ${name}(…). The function’s code must be indented.`
              : "The function body still only contains pass.",
          hint: "Replace pass with the steps your function needs. The hints above can help you start.",
        },
  );

  const returns = fn.body.filter((line) => /^return\b/.test(line.text));
  if (!hasCode || returns.some((line) => RETURN_WITH_VALUE.test(line.text))) {
    if (hasCode) checks.push({ id: "returns", label: "Returns a value", status: "pass" });
  } else {
    const prints = fn.body.some(hasPrint);
    checks.push({
      id: "returns",
      label: "Returns a value",
      status: "fail",
      blocking: true,
      detail: prints
        ? "The function prints its result but doesn’t return it."
        : returns.length > 0
          ? "return on its own gives back None, not a value."
          : "There is no return statement, so the function gives back None.",
      hint: prints
        ? "print only shows text on the screen. return hands the value back to the code that called the function."
        : "Finish the function with return followed by the value it should give back.",
    });
  }

  const blocked = checks.some((check) => check.blocking && check.status === "fail");
  return { checks, fn: blocked ? null : fn };
}

/** Tests to show when the function itself couldn't be checked: none if it is blocked. */
export function testsWithoutFunction(
  checks: RequirementCheck[],
  cases: { label: string; call: string; expected: string }[],
): TestCaseResult[] {
  return checks.some((check) => check.blocking && check.status === "fail") ? [] : unverifiedTests(cases);
}

/**
 * The function body without docstrings and `pass` lines, for the pattern
 * recognisers. Empty when tabs and spaces are mixed in the indentation:
 * Python may reject that, so no pattern should be trusted.
 */
export function statements(fn: PyFunction, scan: ScannedSource): PyLine[] {
  const mixed = fn.body.some((line) => line.tab) && fn.body.some((line) => !line.tab);
  return mixed ? [] : fn.body.filter((line) => !isPlaceholder(line, scan));
}

export const LOOP = /^(?:for|while)\b.*:$/;

/** The first `return` placed directly in a loop's block, if any. */
export function returnInsideLoop(body: PyLine[]): PyLine | null {
  for (let i = 0; i < body.length; i++) {
    if (!LOOP.test(body[i].text)) continue;
    const blockIndent = body[i + 1]?.indent;
    if (blockIndent === undefined || blockIndent <= body[i].indent) continue;
    for (let k = i + 1; k < body.length && body[k].indent > body[i].indent; k++) {
      if (body[k].indent === blockIndent && /^return\b/.test(body[k].text)) return body[k];
    }
  }
  return null;
}

/** Whether `name` is only bound once at the top level (its `def`). */
export function boundOnce(lines: PyLine[], name: string): boolean {
  const rebinds = new RegExp(`^(?:${name}\\s*=[^=]|(?:def|class)\\s+${name}\\b)`);
  return lines.filter((line) => line.indent === 0 && rebinds.test(line.text)).length === 1;
}

/** `print(…)`, or a name bound to plain literals such as `VOWELS = "aeiou"`. */
function simpleTopLevel(scan: ScannedSource, line: PyLine): boolean {
  if (/^print\s*\(/.test(line.text) && line.text.endsWith(")")) return true;
  const tokens = lineTokens(scan, line);
  if (!tokens || tokens.length < 3 || !isName(tokens[0]) || !isOp(tokens[1], "=")) return false;
  return tokens
    .slice(2)
    .every(
      (t) =>
        (t.kind === "str" && !t.literal.prefix.includes("f")) ||
        t.kind === "num" ||
        (t.kind === "op" && "[](){},".includes(t.value)),
    );
}

/**
 * A solution can only be confirmed when the whole file is understood: apart
 * from the function itself, the top level may hold only prints and literal
 * constants. Anything else (imports, other functions, other statements)
 * could fail or change behaviour when run, so results stay unverified.
 */
export function topLevelSupported(scan: ScannedSource, lines: PyLine[], fn: PyFunction): boolean {
  const own = new Set([fn.def, ...fn.body]);
  return lines.every((line) => own.has(line) || (line.indent === 0 && simpleTopLevel(scan, line)));
}

interface Constant {
  value: number | string | null;
  /** As Python would show it, e.g. `0`, `0.0`, `"Hi"`, `None`. */
  display: string;
}

/**
 * The value of a function whose whole body is `return <literal>`: a number,
 * a plain string or None. Anything else, including any other statement in the
 * body or unsupported top-level code, is `null`.
 */
function constantReturn(scan: ScannedSource, lines: PyLine[], fn: PyFunction): Constant | null {
  if (!topLevelSupported(scan, lines, fn)) return null;
  const body = statements(fn, scan);
  const tokens = body.length === 1 ? lineTokens(scan, body[0]) : null;
  if (!tokens || !isName(tokens[0], "return")) return null;
  const negative = tokens.length === 3 && isOp(tokens[1], "-");
  const literal = tokens.length === 2 || negative ? tokens[tokens.length - 1] : undefined;

  if (literal?.kind === "num" && Number.isFinite(literal.value)) {
    const value = negative ? -literal.value : literal.value;
    return { value, display: literal.float && Number.isInteger(value) ? `${value}.0` : String(value) };
  }
  if (negative) return null;
  const text = plainString(literal);
  if (text !== null) return { value: text, display: pythonRepr(text) };
  if (isName(literal, "None")) return { value: null, display: "None" };
  return null;
}

/**
 * Test results for a function that returns a constant, worked out from the
 * literal alone. A constant can't follow its input, so when any test fails a
 * blocking check says so plainly. `null` when the body isn't a constant return.
 */
export function constantReturnResults(
  scan: ScannedSource,
  lines: PyLine[],
  fn: PyFunction,
  cases: { label: string; call: string; expected: string }[],
  expected: readonly (number | string)[],
): CheckerOutput | null {
  const constant = constantReturn(scan, lines, fn);
  if (!constant) return null;
  const tests = cases.map((c, i) => ({ ...c, actual: constant.display, passed: constant.value === expected[i] }));
  if (tests.every((test) => test.passed)) return { checks: [], tests };
  return {
    checks: [
      {
        id: "uses-input",
        label: "Uses its input to work out the result",
        status: "fail",
        blocking: true,
        detail: `${fn.name} always returns ${constant.display}, whatever it is given.`,
        hint: `The answer depends on the value passed in, so ${fn.name} needs to use its parameter to work it out.`,
      },
    ],
    tests,
  };
}
