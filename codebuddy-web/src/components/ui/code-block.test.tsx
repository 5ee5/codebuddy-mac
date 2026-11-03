import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodeBlock, codeLines } from "@/components/ui/code-block";
import { accessibleText, innerTextOf } from "@/test/markup";

// Nested indentation, blank lines, a tab, quotes and a trailing newline.
const PYTHON = `name = "Sam"
age = 10

def greet(person):
    if person:
        for letter in person:
\t\t\tprint(letter, end="")
    return f"<{person}> & 'friends'"

print(greet(name))
`;

function render(props: Partial<Parameters<typeof CodeBlock>[0]> = {}) {
  return renderToStaticMarkup(
    <CodeBlock code={PYTHON} title="example.py" language="Python" label="Code example" {...props} />,
  );
}

describe("CodeBlock code text", () => {
  it("renders the code as one exact string with real newlines and indentation", () => {
    expect(innerTextOf(render(), "code")).toBe(PYTHON);
  });

  it("keeps every line, including blank and indented ones, on its own line", () => {
    const text = innerTextOf(render(), "code")!;
    expect(text.split("\n")).toEqual(PYTHON.split("\n"));
    expect(text).toContain('age = 10\n\ndef greet(person):\n    if person:');
    expect(text).not.toContain('"Sam"age');
  });

  it("passes CRLF line endings through unchanged", () => {
    const crlf = "a = 1\r\nb = 2\r\n";
    expect(innerTextOf(render({ code: crlf }), "code")).toBe(crlf);
  });

  it("keeps line numbers out of the code text", () => {
    const text = innerTextOf(render(), "code")!;
    expect(text.startsWith("name")).toBe(true);
    expect(accessibleText(render())).not.toMatch(/\b1\s*2\s*3\b/);
  });
});

describe("codeLines and the gutter", () => {
  it("does not count a single trailing newline as a line", () => {
    expect(codeLines("a\nb\n")).toEqual(["a", "b"]);
    expect(codeLines("a\nb")).toEqual(["a", "b"]);
    expect(codeLines("a\n\n")).toEqual(["a", ""]);
    expect(codeLines("")).toEqual([""]);
  });

  it("renders one aria-hidden number per visible line", () => {
    const html = render();
    const gutter = html.match(/<div aria-hidden="true"[^>]*>((?:<div>\d+<\/div>)+)<\/div>/);
    expect(gutter).not.toBeNull();
    const numbers = [...gutter![1].matchAll(/<div>(\d+)<\/div>/g)].map((m) => Number(m[1]));
    expect(numbers).toEqual(codeLines(PYTHON).map((_, i) => i + 1));
  });
});

describe("CodeBlock highlights", () => {
  it("places an aria-hidden bar outside the code at (line - 1) × 1.5rem", () => {
    const html = render({ highlight: [1, 4] });
    const bars = [...html.matchAll(/<span aria-hidden="true" data-highlight-line="(\d+)"[^>]*style="top:([^"]+)"/g)];
    expect(bars.map((m) => [Number(m[1]), m[2]])).toEqual([
      [1, "calc(0 * 1.5rem)"],
      [4, "calc(3 * 1.5rem)"],
    ]);
    // Bars are siblings before <code>, never inside it.
    expect(innerTextOf(html, "code")).toBe(PYTHON);
    expect(html.indexOf("data-highlight-line")).toBeLessThan(html.indexOf("<code"));
  });

  it("renders no bars without highlights", () => {
    expect(render()).not.toContain("data-highlight-line");
  });
});

describe("CodeBlock header", () => {
  const html = render({ actions: <button type="button">Copy</button> });
  const header = html.slice(0, html.indexOf('<div tabindex="0"'));

  it("keeps file name, language and action apart in the page text", () => {
    const text = accessibleText(header);
    expect(text).not.toContain("example.pyPython");
    expect(text).not.toContain("PythonCopy");
    expect(text.replace(/\s+/g, " ").trim()).toBe("example.py Language: Python Copy");
  });

  it("separates the language label from the actions with a decorative divider", () => {
    expect(header).toMatch(/<span aria-hidden="true" class="h-4 w-px bg-line"><\/span>/);
  });

  it("omits the divider when there is no language or no action", () => {
    expect(render()).not.toContain("w-px bg-line");
    expect(render({ language: undefined, actions: <button type="button">Copy</button> })).not.toContain(
      "w-px bg-line",
    );
  });

  it("names the scrollable code region", () => {
    expect(html).toMatch(/role="region" aria-label="Code example"/);
  });
});
