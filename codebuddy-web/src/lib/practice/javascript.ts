import type { ScannedSource } from "@/lib/practice/source";

/*
 * A JavaScript tokenizer for the Practice checker. It reads masked code, so
 * comments are gone and every string literal is one token.
 */

export type JsToken = (
  | { kind: "str"; value: string; interpolated: boolean }
  | { kind: "num"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string }
) & {
  /** A line break comes before this token (matters for semicolon insertion). */
  newline?: boolean;
};

const OPS = ["===", "!==", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "=>"];
const MAX_TOKENS = 2000;

/** Tokens of the whole program, or `null` if it is far longer than any supported shape. */
export function jsTokens(scan: ScannedSource): JsToken[] | null {
  const { masked } = scan;
  const tokens: JsToken[] = [];
  let newline = false;
  const push = (token: JsToken) => {
    tokens.push(newline ? { ...token, newline } : token);
    newline = false;
  };
  let i = 0;
  while (i < masked.length) {
    if (tokens.length > MAX_TOKENS) return null;
    const c = masked[i];
    if (/\s/.test(c)) {
      if (c === "\n") newline = true;
      i++;
      continue;
    }
    const literal = scan.strings.get(i);
    if (literal) {
      push({ kind: "str", value: literal.value, interpolated: literal.interpolated === true });
      i = literal.end;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < masked.length && /[\w$]/.test(masked[j])) j++;
      push({ kind: "name", value: masked.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < masked.length && /[0-9.]/.test(masked[j])) j++;
      push({ kind: "num", value: Number(masked.slice(i, j)) });
      i = j;
      continue;
    }
    const op = OPS.find((candidate) => masked.startsWith(candidate, i)) ?? c;
    push({ kind: "op", value: op });
    i += op.length;
  }
  return tokens;
}
