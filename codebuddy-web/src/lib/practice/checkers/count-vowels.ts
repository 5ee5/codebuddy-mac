import {
  isName,
  isOp,
  lineTokens,
  plainString,
  pythonLines,
  pythonRepr,
  type PyFunction,
  type PyLine,
  type PyToken,
} from "@/lib/practice/python";
import { scanPython, type ScannedSource } from "@/lib/practice/source";
import {
  boundOnce,
  checkPythonFunction,
  constantReturnResults,
  statements,
  testsWithoutFunction,
  topLevelSupported,
  unreadable,
  unverifiedTests,
  type CheckerOutput,
} from "@/lib/practice/checkers/shared";
import type { TestCaseResult } from "@/lib/practice/types";

const CASES: { text: string; expected: number; label: string }[] = [
  { text: "Apple", expected: 2, label: "An uppercase vowel" },
  { text: "CodeBuddy", expected: 3, label: "The example word" },
  { text: "", expected: 0, label: "Empty text" },
  { text: "AEIOU aeiou", expected: 10, label: "Every vowel in both cases" },
  { text: "rhythm", expected: 0, label: "No vowels (y doesn’t count)" },
  { text: "Hello, World!", expected: 3, label: "Punctuation and spaces" },
];

type CaseChange = "lower" | "upper";

interface VowelModel {
  /** Case changes applied to each character before the membership test. */
  changes: CaseChange[];
  vowels: Set<string>;
}

/** Walks a token list; every method returns `false`/`null` without consuming on a mismatch. */
class Cursor {
  pos = 0;
  constructor(private readonly tokens: PyToken[]) {}
  get done() {
    return this.pos === this.tokens.length;
  }
  op(value: string): boolean {
    if (!isOp(this.tokens[this.pos], value)) return false;
    this.pos++;
    return true;
  }
  name(value?: string): string | null {
    const token = this.tokens[this.pos];
    if (!isName(token, value)) return null;
    this.pos++;
    return token.value;
  }
  num(value: number): boolean {
    const token = this.tokens[this.pos];
    if (token?.kind !== "num" || token.value !== value) return false;
    this.pos++;
    return true;
  }
  string(): string | null {
    const value = plainString(this.tokens[this.pos]);
    if (value !== null) this.pos++;
    return value;
  }
}

/** `.lower()`, `.upper()` or `.casefold()`, if present. */
function caseChange(cur: Cursor): CaseChange | null | undefined {
  const start = cur.pos;
  if (!cur.op(".")) return undefined;
  const method = cur.name();
  if ((method === "lower" || method === "upper" || method === "casefold") && cur.op("(") && cur.op(")")) {
    return method === "upper" ? "upper" : "lower";
  }
  cur.pos = start;
  return null;
}

/** A string such as "aeiou", a list/tuple/set of one-letter strings, or a known name. */
function vowelSet(cur: Cursor, constants: ReadonlyMap<string, Set<string>>): Set<string> | null {
  const text = cur.string();
  if (text !== null) return new Set(text);
  const name = cur.name();
  if (name !== null) return constants.get(name) ?? null;
  const close = cur.op("[") ? "]" : cur.op("(") ? ")" : cur.op("{") ? "}" : null;
  if (!close) return null;
  const set = new Set<string>();
  for (;;) {
    if (cur.op(close)) return set;
    const letter = cur.string();
    if (letter === null || letter.length !== 1) return null;
    set.add(letter);
    if (!cur.op(",")) return cur.op(close) ? set : null;
  }
}

/** Code tokens joined by single spaces, or `null` if they include a string. */
function compact(tokens: PyToken[] | null): string | null {
  if (!tokens || tokens.some((t) => t.kind === "str")) return null;
  return tokens.map((t) => (t.kind === "num" ? String(t.value) : t.kind === "str" ? "" : t.value)).join(" ");
}

/** `ch in VOWELS` or `ch.lower() in VOWELS`, optionally in parentheses. */
function condition(
  cur: Cursor,
  variable: string,
  constants: ReadonlyMap<string, Set<string>>,
): Omit<VowelModel, "changes"> & { change: CaseChange | undefined } | null {
  if (cur.op("(")) {
    const inner = condition(cur, variable, constants);
    return inner && cur.op(")") ? inner : null;
  }
  if (!cur.name(variable)) return null;
  const change = caseChange(cur);
  if (change === null || !cur.name("in")) return null;
  const vowels = vowelSet(cur, constants);
  return vowels ? { vowels, change } : null;
}

/** `text`, `text.lower()`, `text.upper()` or `text.casefold()`. */
function source(cur: Cursor, param: string): CaseChange[] | null {
  if (!cur.name(param)) return null;
  const change = caseChange(cur);
  if (change === null) return null;
  return change ? [change] : [];
}

/**
 * Recognises three common shapes, after optional setup lines such as
 * `vowels = "aeiou"`, `text = text.lower()` and `count = 0`:
 *
 *     for ch in text:                 return sum(1 for ch in text if ch in "aeiou")
 *         if ch in "aeiou":           return len([ch for ch in text if ch in "aeiou"])
 *             count += 1
 *     return count
 */
function vowelModel(scan: ScannedSource, lines: PyLine[], fn: PyFunction): VowelModel | null {
  const param = fn.params[0];
  if (!param || !boundOnce(lines, "count_vowels")) return null;
  const constants = new Map<string, Set<string>>();
  const changes: CaseChange[] = [];

  // Top-level constants defined before the function, and assigned only once.
  for (const line of lines) {
    if (line === fn.def) break;
    const tokens = line.indent === 0 ? lineTokens(scan, line) : null;
    const target = tokens && isName(tokens[0]) && isOp(tokens[1], "=") ? tokens[0].value : null;
    if (!tokens || !target) continue;
    const cur = new Cursor(tokens.slice(2));
    const set = vowelSet(cur, constants);
    const assignments = lines.filter((l) => l.indent === 0 && new RegExp(`^${target}\\s*=[^=]`).test(l.text));
    if (set && cur.done && assignments.length === 1) constants.set(target, set);
  }

  const body = statements(fn, scan);
  const base = body[0]?.indent;
  let counter: string | null = null;
  let i = 0;

  // Setup lines.
  for (; i < body.length && body[i].indent === base; i++) {
    const tokens = lineTokens(scan, body[i]);
    if (!tokens || !isName(tokens[0]) || !isOp(tokens[1], "=")) break;
    const target = tokens[0].value;
    const cur = new Cursor(tokens.slice(2));
    if (cur.num(0) && cur.done) {
      counter = target;
      continue;
    }
    cur.pos = 0;
    if (target === param) {
      const change = source(cur, param);
      if (!change || !cur.done) return null;
      changes.push(...change);
      continue;
    }
    const set = vowelSet(cur, constants);
    if (!set || !cur.done || target === counter) return null;
    constants.set(target, set);
  }

  const rest = body.slice(i);
  const first = rest[0] && lineTokens(scan, rest[0]);
  if (!first) return null;
  const cur = new Cursor(first);

  // return sum(1 for ch in SRC if COND)  /  return len([ch for ch in SRC if COND])
  if (rest.length === 1 && cur.name("return")) {
    const fnName = cur.name();
    if ((fnName !== "sum" && fnName !== "len") || !cur.op("(")) return null;
    const bracket = cur.op("[");
    if (fnName === "len" && !bracket) return null;
    let variable: string | null;
    if (fnName === "sum") {
      if (!cur.num(1)) return null;
      variable = cur.name("for") && cur.name();
    } else {
      variable = cur.name();
      if (!variable || !cur.name("for") || !cur.name(variable)) return null;
    }
    if (!variable || !cur.name("in")) return null;
    const src = source(cur, param);
    const cond = src && cur.name("if") ? condition(cur, variable, constants) : null;
    if (!src || !cond || (bracket && !cur.op("]")) || !cur.op(")") || !cur.done) return null;
    return { changes: [...changes, ...src, ...(cond.change ? [cond.change] : [])], vowels: cond.vowels };
  }

  // for ch in SRC:  /  if COND:  /  counter += 1  /  return counter
  if (!counter || rest.length < 3 || rest.length > 4 || rest[0].indent !== base) return null;
  const variable = cur.name("for") && cur.name();
  const src = variable && cur.name("in") ? source(cur, param) : null;
  if (!variable || !src || !cur.op(":") || !cur.done) return null;

  const ifTokens = lineTokens(scan, rest[1]);
  if (!ifTokens || rest[1].indent <= base) return null;
  const ifCur = new Cursor(ifTokens);
  const cond = ifCur.name("if") ? condition(ifCur, variable, constants) : null;
  if (!cond || !ifCur.op(":")) return null;

  // The increment, either on the same line as `if …:` or indented below it.
  const inline = !ifCur.done;
  const incrementTokens = inline ? ifTokens.slice(ifCur.pos) : lineTokens(scan, rest[2]);
  if (!inline && rest[2].indent <= rest[1].indent) return null;
  const increment = compact(incrementTokens);
  if (increment !== `${counter} += 1` && increment !== `${counter} = ${counter} + 1`) return null;

  const tail = rest.slice(inline ? 2 : 3);
  if (tail.length !== 1 || tail[0].indent !== base || compact(lineTokens(scan, tail[0])) !== `return ${counter}`) {
    return null;
  }
  return { changes: [...changes, ...src, ...(cond.change ? [cond.change] : [])], vowels: cond.vowels };
}

function countWith(model: VowelModel, text: string): number {
  let count = 0;
  for (let ch of text) {
    for (const change of model.changes) ch = change === "lower" ? ch.toLowerCase() : ch.toUpperCase();
    if (model.vowels.has(ch)) count++;
  }
  return count;
}

function vowelHint(model: VowelModel): string {
  const vowels = "aeiou".split("");
  const counts = (c: string) => countWith(model, c) === 1;
  if (vowels.some((v) => counts(v) && !counts(v.toUpperCase()))) {
    return "Uppercase vowels aren’t counted yet. What happens to the A in \"Apple\"? Hint 2 can help.";
  }
  if (vowels.some((v) => !counts(v) && counts(v.toUpperCase()))) {
    return "Lowercase vowels aren’t counted yet. Make sure both cases are handled.";
  }
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  const extra = letters.filter((c) => !vowels.includes(c) && (counts(c) || counts(c.toUpperCase())));
  const missing = vowels.filter((v) => !counts(v) && !counts(v.toUpperCase()));
  if (extra.length) return `Your code also counts ${extra.join(", ")}. Only a, e, i, o and u are vowels here.`;
  if (missing.length) return `Your code doesn’t count ${missing.join(", ")} yet. Check your list of vowels.`;
  return "Compare the expected and actual counts above and look for the letters that make the difference.";
}

export function checkCountVowels(code: string): CheckerOutput {
  const scan = scanPython(code);
  if (scan.error) return unreadable(scan.error);
  const lines = pythonLines(scan);
  const { checks, fn } = checkPythonFunction(scan, lines, { name: "count_vowels", param: "text" });
  const cases = CASES.map(({ text, expected, label }) => ({
    label,
    call: `count_vowels(${pythonRepr(text)})`,
    expected: String(expected),
  }));
  if (!fn) return { checks, tests: testsWithoutFunction(checks, cases) };

  const constant = constantReturnResults(scan, lines, fn, cases, CASES.map((c) => c.expected));
  if (constant) return { checks: [...checks, ...constant.checks], tests: constant.tests };

  const model = topLevelSupported(scan, lines, fn) ? vowelModel(scan, lines, fn) : null;
  if (!model) return { checks, tests: unverifiedTests(cases) };

  const tests: TestCaseResult[] = CASES.map(({ text, expected }, i) => {
    const actual = countWith(model, text);
    return { ...cases[i], actual: String(actual), passed: actual === expected };
  });
  return { checks, tests, testHint: vowelHint(model) };
}
