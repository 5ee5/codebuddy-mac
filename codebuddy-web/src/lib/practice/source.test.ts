import { describe, expect, it } from "vitest";
import { pythonFunctions, pythonLines } from "@/lib/practice/python";
import { lineAt, scanJavaScript, scanPython } from "@/lib/practice/source";

describe("scanPython", () => {
  it("blanks comments and string contents but keeps offsets and lines", () => {
    const code = 'x = "sum(a)"  # call sum(b)\ny = 1';
    const scan = scanPython(code);
    expect(scan.error).toBeNull();
    expect(scan.masked).toHaveLength(code.length);
    expect(scan.masked).not.toContain("sum");
    expect(scan.masked.split("\n")).toHaveLength(2);
    expect([...scan.strings.values()]).toEqual([{ start: 4, end: 12, prefix: "", value: "sum(a)" }]);
  });

  it("reads prefixes, escapes, raw strings and triple quotes", () => {
    const code = 'a = f"Hi {name}!"\nb = r"\\d"\nc = "tab\\there"\nd = """one\nline two"""';
    const values = [...scanPython(code).strings.values()].map((s) => [s.prefix, s.value]);
    expect(values).toEqual([
      ["f", "Hi {name}!"],
      ["r", "\\d"],
      ["", "tab\there"],
      ["", "one\nline two"],
    ]);
  });

  it("keeps a triple-quoted string on one logical line", () => {
    const scan = scanPython('def f(x):\n    """Doc\nstill doc"""\n    return x');
    const [fn] = pythonFunctions(pythonLines(scan));
    expect(fn.body.map((line) => line.line)).toEqual([2, 4]);
  });

  it("joins lines while brackets are open", () => {
    const lines = pythonLines(scanPython("total = (1 +\n    2)\nprint(total)"));
    expect(lines.map((line) => [line.line, line.indent])).toEqual([
      [1, 0],
      [3, 0],
    ]);
  });

  it.each([
    ["an unclosed single-line string", 'x = "abc\ny = 1', 1, /never closed/],
    ["an unclosed triple-quoted string", 'x = 1\ny = """abc', 2, /never closed/],
    ["an unclosed bracket", "x = [1, 2\ny = 3", 1, /“\[” on line 1 is never closed/],
    ["mismatched brackets", "x = (1, 2]", 1, /doesn’t match/],
    ["a stray closer", "x = 1)", 1, /no matching/],
  ])("reports %s", (_label, code, line, message) => {
    const { error } = scanPython(code);
    expect(error?.line).toBe(line);
    expect(error?.message).toMatch(message);
  });

  it("ignores brackets and quotes inside comments", () => {
    expect(scanPython("x = 1  # it's (fine\n").error).toBeNull();
  });
});

describe("scanJavaScript", () => {
  it("blanks line and block comments and strings", () => {
    const code = '// console.log("x")\n/* if (i % 3) */ const s = "Fizz"; const t = `Buzz`;';
    const scan = scanJavaScript(code);
    expect(scan.error).toBeNull();
    expect(scan.masked).not.toMatch(/console|Fizz|Buzz|%/);
    expect([...scan.strings.values()].map((s) => s.value)).toEqual(["Fizz", "Buzz"]);
  });

  it("marks template literals with ${…} as interpolated", () => {
    const [literal] = scanJavaScript("const s = `n: ${i % 3}`;").strings.values();
    expect(literal).toMatchObject({ value: "n: ", interpolated: true });
  });

  it.each([
    ["an unclosed string", 'console.log("Fizz);', 1],
    ["an unclosed block comment", "let x = 1;\n/* note", 2],
    ["an unclosed brace", "for (;;) {\n  x++;", 1],
  ])("reports %s", (_label, code, line) => {
    expect(scanJavaScript(code).error?.line).toBe(line);
  });
});

describe("lineAt", () => {
  it("counts lines from 1", () => {
    expect(lineAt("a\nb\nc", 0)).toBe(1);
    expect(lineAt("a\nb\nc", 4)).toBe(3);
  });
});
