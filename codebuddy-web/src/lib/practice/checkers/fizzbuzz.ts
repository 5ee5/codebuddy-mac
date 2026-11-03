import { jsTokens, type JsToken } from "@/lib/practice/javascript";
import { scanJavaScript } from "@/lib/practice/source";
import { unreadable, unverifiedTests, type CheckerOutput } from "@/lib/practice/checkers/shared";
import type { RequirementCheck, TestCaseResult } from "@/lib/practice/types";

/*
 * FizzBuzz is checked by turning a supported program into a small tree and
 * working out what each number would print. The supported shape is one
 * counting `for` loop whose body is built from `if / else if / else`, blocks
 * and `console.log(<string or the loop variable>)`. Conditions may use only
 * the loop variable, numbers, `%`, `===`/`==`/`!==`/`!=`, `!`, `&&` and `||`.
 * Anything else is not understood, and the result says it wasn't verified.
 */

type Expr =
  | { kind: "num"; value: number }
  | { kind: "var" }
  | { kind: "mod"; left: Expr; right: Expr }
  | { kind: "compare"; op: string; left: Expr; right: Expr }
  | { kind: "not"; operand: Expr }
  | { kind: "logic"; op: "&&" | "||"; left: Expr; right: Expr };

type Stmt =
  | { kind: "block"; body: Stmt[] }
  | { kind: "if"; test: Expr; then: Stmt; otherwise: Stmt | null }
  | { kind: "log"; text: string | null };

interface Program {
  start: number;
  /** Last value of the loop variable (inclusive). */
  end: number;
  body: Stmt;
}

const MAX_DEPTH = 20;
const MAX_ITERATIONS = 1000;
const COMPARISONS = ["===", "==", "!==", "!="];

/** Thrown inside the parser for any unsupported token; caught in `parseProgram`. */
class Unsupported extends Error {}

function parseProgram(tokens: JsToken[]): Program | null {
  let pos = 0;
  let depth = 0;
  let variable = "";

  const peek = () => tokens[pos];
  const isOp = (value: string) => peek()?.kind === "op" && peek().value === value;
  const isName = (value: string) => peek()?.kind === "name" && peek().value === value;
  function op(value: string) {
    if (!isOp(value)) throw new Unsupported();
    pos++;
  }
  function name(value?: string): string {
    const token = peek();
    if (token?.kind !== "name" || (value !== undefined && token.value !== value)) throw new Unsupported();
    pos++;
    return token.value;
  }
  function integer(): number {
    const token = peek();
    if (token?.kind !== "num" || !Number.isInteger(token.value)) throw new Unsupported();
    pos++;
    return token.value;
  }
  function nested<T>(parse: () => T): T {
    if (++depth > MAX_DEPTH) throw new Unsupported();
    try {
      return parse();
    } finally {
      depth--;
    }
  }

  // ---- Conditions
  function atom(): Expr {
    return nested(() => {
      const token = peek();
      if (token?.kind === "num") {
        pos++;
        return { kind: "num", value: token.value };
      }
      if (token?.kind === "name" && token.value === variable) {
        pos++;
        return { kind: "var" };
      }
      op("(");
      const inner = orExpr();
      op(")");
      return inner;
    });
  }
  function modExpr(): Expr {
    const left = atom();
    if (!isOp("%")) return left;
    pos++;
    return { kind: "mod", left, right: atom() };
  }
  function unary(): Expr {
    if (!isOp("!")) return modExpr();
    pos++;
    return nested(() => ({ kind: "not", operand: unary() }));
  }
  function compare(): Expr {
    const left = unary();
    const token = peek();
    if (token?.kind !== "op" || !COMPARISONS.includes(token.value)) return left;
    pos++;
    return { kind: "compare", op: token.value, left, right: unary() };
  }
  function andExpr(): Expr {
    let left = compare();
    while (isOp("&&")) {
      pos++;
      left = { kind: "logic", op: "&&", left, right: compare() };
    }
    return left;
  }
  function orExpr(): Expr {
    let left = andExpr();
    while (isOp("||")) {
      pos++;
      left = { kind: "logic", op: "||", left, right: andExpr() };
    }
    return left;
  }

  // ---- Statements
  function statement(): Stmt {
    return nested((): Stmt => {
      if (isOp(";")) {
        pos++;
        return { kind: "block", body: [] };
      }
      if (isOp("{")) {
        pos++;
        const body: Stmt[] = [];
        while (!isOp("}")) body.push(statement());
        pos++;
        return { kind: "block", body };
      }
      if (isName("if")) {
        pos++;
        op("(");
        const test = orExpr();
        op(")");
        const then = statement();
        let otherwise: Stmt | null = null;
        if (isName("else")) {
          pos++;
          otherwise = statement();
        }
        return { kind: "if", test, then, otherwise };
      }
      name("console");
      op(".");
      name("log");
      op("(");
      const token = peek();
      let text: string | null;
      if (token?.kind === "str" && !token.interpolated) text = token.value;
      else if (token?.kind === "name" && token.value === variable) text = null;
      else throw new Unsupported();
      pos++;
      op(")");
      // Without a semicolon, the statement must end at a line break or `}`,
      // or JavaScript reports a syntax error (e.g. `log("Fizz") else …`).
      if (isOp(";")) pos++;
      else if (peek() && !peek().newline && !isOp("}")) throw new Unsupported();
      return { kind: "log", text };
    });
  }

  try {
    // for (let i = 1; i <= 15; i++)
    name("for");
    op("(");
    if (isName("let") || isName("var")) pos++;
    variable = name();
    op("=");
    const start = integer();
    op(";");
    name(variable);
    const inclusive = isOp("<=");
    if (!inclusive) op("<");
    else pos++;
    const limit = integer();
    op(";");
    if (isOp("++")) {
      pos++;
      name(variable);
    } else {
      name(variable);
      if (isOp("++")) pos++;
      else {
        op("+=");
        if (integer() !== 1) throw new Unsupported();
      }
    }
    op(")");
    const body = statement();
    while (isOp(";")) pos++;
    if (pos !== tokens.length) return null;
    return { start, end: inclusive ? limit : limit - 1, body };
  } catch (error) {
    if (error instanceof Unsupported) return null;
    throw error;
  }
}

type Value = number | boolean;

const truthy = (value: Value) => (typeof value === "number" ? value !== 0 && !Number.isNaN(value) : value);

function evaluate(expr: Expr, i: number): Value {
  switch (expr.kind) {
    case "num":
      return expr.value;
    case "var":
      return i;
    case "mod":
      return Number(evaluate(expr.left, i)) % Number(evaluate(expr.right, i));
    case "not":
      return !truthy(evaluate(expr.operand, i));
    case "logic": {
      const left = evaluate(expr.left, i);
      if (expr.op === "&&") return truthy(left) ? evaluate(expr.right, i) : left;
      return truthy(left) ? left : evaluate(expr.right, i);
    }
    case "compare": {
      const left = evaluate(expr.left, i);
      const right = evaluate(expr.right, i);
      const strict = expr.op.length === 3;
      const equal = strict ? left === right : Number(left) === Number(right);
      return expr.op.startsWith("!") ? !equal : equal;
    }
  }
}

function run(stmt: Stmt, i: number, out: string[]) {
  if (stmt.kind === "block") stmt.body.forEach((s) => run(s, i, out));
  else if (stmt.kind === "if") {
    if (truthy(evaluate(stmt.test, i))) run(stmt.then, i, out);
    else if (stmt.otherwise) run(stmt.otherwise, i, out);
  } else out.push(stmt.text ?? String(i));
}

const expectedFor = (n: number) => (n % 15 === 0 ? "FizzBuzz" : n % 3 === 0 ? "Fizz" : n % 5 === 0 ? "Buzz" : String(n));

const GROUPS: { label: string; numbers: number[]; expected: string }[] = [
  { label: "Multiples of 3 print Fizz", numbers: [3, 6, 9, 12], expected: "Fizz" },
  { label: "Multiples of 5 print Buzz", numbers: [5, 10], expected: "Buzz" },
  { label: "Multiples of 3 and 5 print FizzBuzz", numbers: [15], expected: "FizzBuzz" },
  { label: "Other numbers print themselves", numbers: [1, 2, 4, 7, 8, 11, 13, 14], expected: "the number" },
];

const COUNT_LABEL = "Prints one line for each number from 1 to 15";
const COUNT_EXPECTED = "15 lines, for 1 to 15";

function describe(lines: string[] | undefined): string {
  if (!lines || lines.length === 0) return "nothing";
  return lines.join(", ");
}

function buildTests(program: Program): { tests: TestCaseResult[]; hint: string } | null {
  if (program.end - program.start + 1 > MAX_ITERATIONS) return null;
  const printed = new Map<number, string[]>();
  for (let i = program.start; i <= program.end; i++) {
    const out: string[] = [];
    run(program.body, i, out);
    printed.set(i, out);
  }

  const visited = [...printed.keys()];
  const extraLines = [...printed.entries()].find(([, lines]) => lines.length !== 1);
  const countPasses = program.start === 1 && program.end === 15 && !extraLines;
  const countActual =
    visited.length === 0
      ? "the loop never runs"
      : program.start !== 1 || program.end !== 15
        ? `numbers ${program.start} to ${program.end}`
        : extraLines
          ? `${extraLines[0]} printed ${extraLines[1].length === 0 ? "nothing" : `${extraLines[1].length} lines: ${describe(extraLines[1])}`}`
          : COUNT_EXPECTED;

  const tests: TestCaseResult[] = [
    { label: COUNT_LABEL, call: "1 to 15", expected: COUNT_EXPECTED, actual: countActual, passed: countPasses },
    ...GROUPS.map(({ label, numbers, expected }) => {
      const wrong = numbers.find((n) => describe(printed.get(n)) !== expectedFor(n));
      return {
        label,
        call: numbers.join(", "),
        expected,
        actual: wrong === undefined ? expected : `${wrong} printed ${describe(printed.get(wrong))}`,
        passed: wrong === undefined,
      };
    }),
  ];

  const fifteen = describe(printed.get(15));
  const hint =
    fifteen === "Fizz" || fifteen === "Buzz"
      ? `15 is a multiple of both 3 and 5, but your code printed ${fifteen}. Which condition has to be tested first?`
      : extraLines && extraLines[1].length > 1
        ? "Some numbers print more than one line. Use else if and else so that only one branch runs for each number."
        : program.start !== 1 || program.end !== 15
          ? "Check where your loop starts and stops: it should visit every number from 1 up to and including 15."
          : "Compare the expected and actual output for the numbers listed above.";
  return { tests, hint };
}

const WORDS = ["Fizz", "Buzz", "FizzBuzz"];

export function checkFizzBuzz(code: string): CheckerOutput {
  const scan = scanJavaScript(code);
  if (scan.error) return unreadable(scan.error);

  const checks: RequirementCheck[] = [];
  const prints = /\bconsole\s*\.\s*log\s*\(/.test(scan.masked);
  checks.push(
    prints
      ? { id: "prints", label: "Prints with console.log", status: "pass" }
      : {
          id: "prints",
          label: "Prints with console.log",
          status: "fail",
          blocking: true,
          detail: "CodeBuddy couldn’t find console.log, so nothing is printed.",
          hint: "In JavaScript, console.log(value) prints a value on its own line.",
        },
  );
  if (!prints) return { checks, tests: [] };

  const literals = [...scan.strings.values()].map((s) => s.value);
  const nearMisses = literals.filter((text) => /fizz|buzz/i.test(text) && !WORDS.includes(text));
  const missing = ["Fizz", "Buzz"].filter((word) => !literals.includes(word));
  const wordsLabel = "Uses the exact words Fizz, Buzz and FizzBuzz";
  checks.push(
    nearMisses.length
      ? {
          id: "words",
          label: wordsLabel,
          status: "fail",
          detail: `Found ${nearMisses.map((text) => `“${text}”`).join(", ")}. The output must match exactly.`,
          hint: "Check capital letters and spaces: Fizz, Buzz and FizzBuzz each start with a capital letter and have no spaces.",
        }
      : missing.length
        ? {
            id: "words",
            label: wordsLabel,
            status: "fail",
            detail: `Your code doesn’t print ${missing.join(" or ")} yet.`,
            hint: "Multiples of 3 print the word Fizz instead of the number, and multiples of 5 print Buzz.",
          }
        : { id: "words", label: wordsLabel, status: "pass" },
  );

  const tokens = jsTokens(scan);
  const program = tokens && parseProgram(tokens);
  const result = program && buildTests(program);
  if (!result) {
    return {
      checks,
      tests: unverifiedTests([
        { label: COUNT_LABEL, call: "1 to 15", expected: COUNT_EXPECTED },
        ...GROUPS.map(({ label, numbers, expected }) => ({ label, call: numbers.join(", "), expected })),
      ]),
    };
  }
  return { checks, tests: result.tests, testHint: result.hint };
}
