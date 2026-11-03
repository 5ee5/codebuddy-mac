/*
 * Reads learner code as text, never runs it. A scan blanks out comments and
 * the insides of string literals (offsets and line numbers stay the same), so
 * later pattern checks can't be fooled by keywords inside a comment or a
 * string. It also reports the two kinds of malformed input that are certain
 * from text alone: unclosed strings or comments, and unbalanced brackets.
 *
 * Every scan is a single linear pass over the input.
 */

export interface StringLiteral {
  /** Offset of the first character, including any prefix such as `f`. */
  start: number;
  /** Offset just after the closing quote. */
  end: number;
  /** Lower-cased Python prefix (`f`, `r`, `rb`, …); empty for JavaScript. */
  prefix: string;
  /** Contents with escapes decoded (raw strings keep them). */
  value: string;
  /** A JavaScript template literal with `${…}` parts. */
  interpolated?: boolean;
}

export interface SourceError {
  line: number;
  message: string;
}

export interface ScannedSource {
  code: string;
  /** Same length as `code`; comments and string contents are spaces. */
  masked: string;
  /** String literals keyed by their start offset. */
  strings: Map<number, StringLiteral>;
  error: SourceError | null;
}

export function lineAt(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code[i] === "\n") line++;
  }
  return line;
}

const OPENERS = "([{";
const CLOSERS = ")]}";

function checkBrackets(code: string, masked: string): SourceError | null {
  const stack: { char: string; offset: number }[] = [];
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (OPENERS.includes(c)) {
      stack.push({ char: c, offset: i });
      continue;
    }
    const kind = CLOSERS.indexOf(c);
    if (kind === -1) continue;
    const top = stack.pop();
    if (!top) {
      const line = lineAt(code, i);
      return { line, message: `There’s a “${c}” on line ${line} with no matching “${OPENERS[kind]}” before it.` };
    }
    if (top.char !== OPENERS[kind]) {
      const line = lineAt(code, i);
      const opened = lineAt(code, top.offset);
      return {
        line,
        message: `The “${c}” on line ${line} doesn’t match the “${top.char}” opened on line ${opened}.`,
      };
    }
  }
  const open = stack.pop();
  if (open) {
    const line = lineAt(code, open.offset);
    return { line, message: `The “${open.char}” on line ${line} is never closed.` };
  }
  return null;
}

function unclosedString(code: string, start: number): SourceError {
  const line = lineAt(code, start);
  return {
    line,
    message: `The text (string) that starts on line ${line} is never closed. Check that it ends with the same quote it starts with.`,
  };
}

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentChar = (c: string) => /[A-Za-z0-9_$]/.test(c);

function decodeEscape(next: string): string {
  switch (next) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "\\":
    case "'":
    case '"':
    case "`":
      return next;
    case "\n":
      return "";
    default:
      return `\\${next}`;
  }
}

/** Blanks `out[from..to)`, keeping newlines when `keepNewlines` is set. */
function blank(out: string[], from: number, to: number, keepNewlines: boolean) {
  for (let k = from; k < to && k < out.length; k++) {
    if (!(keepNewlines && out[k] === "\n")) out[k] = " ";
  }
}

// ----------------------------------------------------------------- Python ----

const PYTHON_PREFIXES = new Set(["r", "u", "b", "f", "br", "rb", "fr", "rf"]);

/**
 * Reads a Python string whose opening quote is at `quoteAt`. Contents are
 * blanked, newlines included, so a triple-quoted string never looks like
 * several lines of code.
 */
function readPythonString(
  code: string,
  out: string[],
  start: number,
  quoteAt: number,
  prefix: string,
): StringLiteral | null {
  const quote = code[quoteAt];
  const delimiter = code.startsWith(quote.repeat(3), quoteAt) ? quote.repeat(3) : quote;
  const raw = prefix.includes("r");
  let value = "";
  let j = quoteAt + delimiter.length;
  while (j < code.length) {
    const c = code[j];
    if (c === "\\") {
      const next = code[j + 1] ?? "";
      value += raw ? c + next : decodeEscape(next);
      blank(out, j, j + 2, false);
      j += 2;
      continue;
    }
    if (c === "\n" && delimiter.length === 1) return null;
    if (code.startsWith(delimiter, j)) {
      return { start, end: j + delimiter.length, prefix, value };
    }
    value += c;
    out[j] = " ";
    j++;
  }
  return null;
}

export function scanPython(code: string): ScannedSource {
  const out = code.split("");
  const strings = new Map<number, StringLiteral>();
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === "#") {
      while (i < code.length && code[i] !== "\n") out[i++] = " ";
      continue;
    }
    let prefix = "";
    let quoteAt = -1;
    if (c === '"' || c === "'") {
      quoteAt = i;
    } else if (isIdentStart(c)) {
      let j = i;
      while (j < code.length && isIdentChar(code[j])) j++;
      const word = code.slice(i, j).toLowerCase();
      if ((code[j] === '"' || code[j] === "'") && PYTHON_PREFIXES.has(word)) {
        prefix = word;
        quoteAt = j;
      } else {
        i = j;
        continue;
      }
    }
    if (quoteAt === -1) {
      i++;
      continue;
    }
    const literal = readPythonString(code, out, i, quoteAt, prefix);
    if (!literal) return { code, masked: out.join(""), strings, error: unclosedString(code, i) };
    strings.set(i, literal);
    i = literal.end;
  }
  const masked = out.join("");
  return { code, masked, strings, error: checkBrackets(code, masked) };
}

// ------------------------------------------------------------- JavaScript ----

function readJavaScriptString(code: string, out: string[], start: number): StringLiteral | null {
  const quote = code[start];
  let value = "";
  let interpolated = false;
  let j = start + 1;
  while (j < code.length) {
    const c = code[j];
    if (c === "\\") {
      value += decodeEscape(code[j + 1] ?? "");
      blank(out, j, j + 2, false);
      j += 2;
      continue;
    }
    if (c === "\n" && quote !== "`") return null;
    if (c === quote) return { start, end: j + 1, prefix: "", value, interpolated };
    if (quote === "`" && c === "$" && code[j + 1] === "{") {
      // Skip the embedded expression; it is blanked, never read.
      interpolated = true;
      let depth = 0;
      while (j < code.length) {
        if (code[j] === "{") depth++;
        else if (code[j] === "}" && --depth === 0) break;
        out[j] = " ";
        j++;
      }
      if (j >= code.length) return null;
      out[j] = " ";
      j++;
      continue;
    }
    value += c;
    out[j] = " ";
    j++;
  }
  return null;
}

export function scanJavaScript(code: string): ScannedSource {
  const out = code.split("");
  const strings = new Map<number, StringLiteral>();
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (c === "/" && code[i + 1] === "*") {
      const close = code.indexOf("*/", i + 2);
      if (close === -1) {
        const line = lineAt(code, i);
        return {
          code,
          masked: out.join(""),
          strings,
          error: { line, message: `The comment that starts on line ${line} is never closed with */.` },
        };
      }
      blank(out, i, close + 2, true);
      i = close + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const literal = readJavaScriptString(code, out, i);
      if (!literal) return { code, masked: out.join(""), strings, error: unclosedString(code, i) };
      strings.set(i, literal);
      i = literal.end;
      continue;
    }
    i++;
  }
  const masked = out.join("");
  return { code, masked, strings, error: checkBrackets(code, masked) };
}
