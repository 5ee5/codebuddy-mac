import type { ScannedSource, StringLiteral } from "@/lib/practice/source";

/*
 * Just enough Python structure for the Practice checkers: logical lines with
 * their indentation, top-level `def`s with their bodies, a tokenizer, and an
 * evaluator for string expressions such as f"Hello, {name}!". Anything
 * outside that small grammar is reported as "not understood" (`null`) so the
 * caller can say it couldn't verify the code, never that the code is wrong.
 */

export interface PyLine {
  /** Offset of the first non-blank character. */
  start: number;
  /** Masked text of the whole logical line, without indentation. */
  text: string;
  /** Indentation width (tabs advance to the next multiple of 8). */
  indent: number;
  /** The indentation contains a tab. */
  tab?: boolean;
  line: number;
}

function indentWidth(whitespace: string): number {
  let width = 0;
  for (const c of whitespace) width = c === "\t" ? width + 8 - (width % 8) : width + 1;
  return width;
}

/**
 * Splits masked code into logical lines: a line continues while brackets are
 * open or after a trailing backslash. Blank lines (and comment-only lines,
 * which are blank once masked) are skipped.
 */
export function pythonLines(scan: ScannedSource): PyLine[] {
  const { masked } = scan;
  const lines: PyLine[] = [];
  let pos = 0;
  // Counted on the original code: masked strings have no newlines left.
  let lineNo = 1;
  let counted = 0;
  while (pos <= masked.length) {
    for (; counted < pos; counted++) if (scan.code[counted] === "\n") lineNo++;
    let end = pos;
    let depth = 0;
    for (;;) {
      const nl = masked.indexOf("\n", end);
      const lineEnd = nl === -1 ? masked.length : nl;
      for (let k = end; k < lineEnd; k++) {
        const c = masked[k];
        if (c === "(" || c === "[" || c === "{") depth++;
        else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
      }
      const continued = depth > 0 || masked.slice(end, lineEnd).trimEnd().endsWith("\\");
      end = lineEnd;
      if (!continued || nl === -1) break;
      end = lineEnd + 1;
    }
    // Same length as the source slice, so offsets inside `text` still map back.
    const raw = masked.slice(pos, end).replace(/[\n\\]/g, " ");
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text) {
      const whitespace = raw.slice(0, leading);
      lines.push({ start: pos + leading, text, indent: indentWidth(whitespace), tab: whitespace.includes("\t"), line: lineNo });
    }
    pos = end + 1;
  }
  return lines;
}

export interface PyFunction {
  name: string;
  /** Parameter names; `null` when a parameter isn't a plain name (`*args`, `/`). */
  params: (string | null)[];
  def: PyLine;
  /** The indented body, or the single statement after `:` on the same line. */
  body: PyLine[];
}

function matchingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** Splits on commas that are not inside brackets. */
export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((part) => part.trim()).filter(Boolean);
}

const DEF = /^def\s+([A-Za-z_]\w*)\s*\(/;
const PLAIN_PARAM = /^([A-Za-z_]\w*)\s*(?::[^=]*)?(?:=.*)?$/;

/** Every top-level `def` in the code, in order. */
export function pythonFunctions(lines: PyLine[]): PyFunction[] {
  const functions: PyFunction[] = [];
  lines.forEach((line, index) => {
    if (line.indent !== 0) return;
    const match = DEF.exec(line.text);
    if (!match) return;
    const open = match[0].length - 1;
    const close = matchingParen(line.text, open);
    if (close === -1) return;
    const rest = line.text.slice(close + 1);
    const colon = /^\s*(?:->[^:]*)?:/.exec(rest);
    if (!colon) return;

    const params = splitTopLevel(line.text.slice(open + 1, close)).map(
      (param) => PLAIN_PARAM.exec(param)?.[1] ?? null,
    );
    const inline = rest.slice(colon[0].length);
    let body: PyLine[];
    if (inline.trim()) {
      const offset = close + 1 + colon[0].length + (inline.length - inline.trimStart().length);
      body = [{ start: line.start + offset, text: inline.trim(), indent: 1, line: line.line }];
    } else {
      body = [];
      for (let k = index + 1; k < lines.length && lines[k].indent > 0; k++) body.push(lines[k]);
    }
    functions.push({ name: match[1], params, def: line, body });
  });
  return functions;
}

/** A line that is nothing but one string literal, such as a docstring. */
export function isStringOnly(line: PyLine, scan: ScannedSource): boolean {
  const literal = scan.strings.get(line.start);
  return literal !== undefined && literal.end - line.start === line.text.length;
}

/** `pass`, `...` or a docstring: lines that do nothing. */
export function isPlaceholder(line: PyLine, scan: ScannedSource): boolean {
  return line.text === "pass" || line.text === "..." || isStringOnly(line, scan);
}

// ---------------------------------------------------------------- Tokens ----

export type PyToken =
  | { kind: "str"; literal: StringLiteral }
  | { kind: "num"; value: number; float: boolean }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string };

const TWO_CHAR_OPS = ["==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "//", "**", "->"];
const MAX_TOKENS = 400;

/**
 * Tokens of the masked text from `start` to `end`. Returns `null` for very
 * long statements, which no supported pattern needs.
 */
export function pyTokens(scan: ScannedSource, start: number, end: number): PyToken[] | null {
  const { masked } = scan;
  const tokens: PyToken[] = [];
  let i = start;
  while (i < end) {
    if (tokens.length > MAX_TOKENS) return null;
    const c = masked[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\\") {
      i++;
      continue;
    }
    const literal = scan.strings.get(i);
    if (literal) {
      tokens.push({ kind: "str", literal });
      i = literal.end;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < end && /\w/.test(masked[j])) j++;
      tokens.push({ kind: "name", value: masked.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(masked[i + 1] ?? ""))) {
      let j = i;
      while (j < end && /[0-9.]/.test(masked[j])) j++;
      const text = masked.slice(i, j);
      tokens.push({ kind: "num", value: Number(text), float: text.includes(".") });
      i = j;
      continue;
    }
    const two = masked.slice(i, i + 2);
    const op = TWO_CHAR_OPS.includes(two) ? two : c;
    tokens.push({ kind: "op", value: op });
    i += op.length;
  }
  return tokens;
}

/** Tokens of one logical line. */
export function lineTokens(scan: ScannedSource, line: PyLine): PyToken[] | null {
  return pyTokens(scan, line.start, line.start + line.text.length);
}

export const isOp = (token: PyToken | undefined, value: string) =>
  token?.kind === "op" && token.value === value;

export const isName = (token: PyToken | undefined, value?: string): token is { kind: "name"; value: string } =>
  token?.kind === "name" && (value === undefined || token.value === value);

/** A plain (not bytes, not f-) string literal's value, or `null`. */
export function plainString(token: PyToken | undefined): string | null {
  if (token?.kind !== "str" || /[bf]/.test(token.literal.prefix)) return null;
  return token.literal.value;
}

// ------------------------------------------------------ String evaluation ----

/** Fills an f-string whose fields are bare names, such as f"Hi {name}!". */
function formatFString(template: string, env: ReadonlyMap<string, string>): string | null {
  let out = "";
  for (let i = 0; i < template.length; i++) {
    const c = template[i];
    if ((c === "{" || c === "}") && template[i + 1] === c) {
      out += c;
      i++;
    } else if (c === "{") {
      const close = template.indexOf("}", i);
      if (close === -1) return null;
      const field = /^\s*([A-Za-z_]\w*)\s*(?:!s)?\s*$/.exec(template.slice(i + 1, close));
      const value = field ? env.get(field[1]) : undefined;
      if (value === undefined) return null;
      out += value;
      i = close;
    } else if (c === "}") {
      return null;
    } else {
      out += c;
    }
  }
  return out;
}

const MAX_DEPTH = 20;

/**
 * Evaluates a string expression built from string literals, f-strings, `+`,
 * parentheses, `str(…)` and names in `env`. Returns `null` for anything else.
 * This is a pure function over tokens; nothing is executed.
 */
export function evalStringExpr(tokens: PyToken[], env: ReadonlyMap<string, string>): string | null {
  let pos = 0;
  let depth = 0;

  function expr(): string | null {
    let value = term();
    while (value !== null && isOp(tokens[pos], "+")) {
      pos++;
      const right = term();
      value = right === null ? null : value + right;
    }
    return value;
  }

  function closed(value: string | null): string | null {
    if (value === null || !isOp(tokens[pos], ")")) return null;
    pos++;
    return value;
  }

  function term(): string | null {
    if (++depth > MAX_DEPTH) return null;
    try {
      const token = tokens[pos++];
      if (token?.kind === "str") {
        const { prefix, value } = token.literal;
        if (prefix.includes("b")) return null;
        return prefix.includes("f") ? formatFString(value, env) : value;
      }
      if (isName(token, "str") && isOp(tokens[pos], "(")) {
        pos++;
        return closed(expr());
      }
      if (isName(token)) return env.get(token.value) ?? null;
      if (isOp(token, "(")) return closed(expr());
      return null;
    } finally {
      depth--;
    }
  }

  const value = expr();
  return pos === tokens.length ? value : null;
}

/** Shows a Python value the way the exercise text writes it. */
export function pythonRepr(value: string | number | null): string {
  if (value === null) return "None";
  if (typeof value === "number") return String(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}
