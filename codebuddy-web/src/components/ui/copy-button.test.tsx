import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CopyButton, copyText, copyWithExecCommand } from "@/components/ui/copy-button";
import { accessibleText } from "@/test/markup";

const CODE = 'def greet(name):\n    if name:\n\t\treturn f"Hi {name}"\n\nprint(greet("Sam"))\n';

/*
 * A minimal stand-in for the DOM parts the legacy fallback touches. Its
 * `execCommand("copy")` behaves like a browser: it fires the `copy` event,
 * lets listeners set clipboard data, and returns whether copying worked.
 */
function fakeDocument({ execResult = true, throws = false } = {}) {
  const clipboard: { data: string | null } = { data: null };
  const listeners = new Set<(event: unknown) => void>();
  const previousFocus = { focus: vi.fn() };
  const previousRange = { id: "user-selection" };
  const ranges: unknown[] = [previousRange];
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    tabIndex: 0,
    attributes: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
    focus: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
    remove: vi.fn(),
  };
  const doc = {
    activeElement: previousFocus,
    body: { appendChild: vi.fn() },
    createElement: vi.fn(() => textarea),
    getSelection: () => ({
      get rangeCount() {
        return ranges.length;
      },
      getRangeAt: (i: number) => ranges[i],
      removeAllRanges: () => ranges.splice(0),
      addRange: (range: unknown) => ranges.push(range),
    }),
    addEventListener: vi.fn((type: string, fn: (event: unknown) => void) => {
      if (type === "copy") listeners.add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: (event: unknown) => void) => {
      if (type === "copy") listeners.delete(fn);
    }),
    execCommand: vi.fn((command: string) => {
      if (throws) throw new Error("not allowed");
      if (command !== "copy" || !execResult) return false;
      const event = {
        clipboardData: { setData: (_type: string, data: string) => (clipboard.data = data) },
        preventDefault: vi.fn(),
      };
      listeners.forEach((fn) => fn(event));
      return true;
    }),
  };
  vi.stubGlobal("document", doc);
  return { doc, textarea, clipboard, listeners, previousFocus, previousRange, ranges };
}

/** Checks that the fallback left the page as it found it. */
function expectCleanedUp(fake: ReturnType<typeof fakeDocument>) {
  expect(fake.textarea.remove).toHaveBeenCalledOnce();
  expect(fake.listeners.size).toBe(0);
  expect(fake.previousFocus.focus).toHaveBeenCalled();
  expect(fake.ranges).toEqual([fake.previousRange]);
}

// Tabs, CRLF, indentation, blank lines and a trailing newline must all survive.
const TRICKY = "def f():\r\n\tif True:\r\n        return 1\r\n\r\nprint(f())\n";

describe("copyText", () => {
  it("uses the Clipboard API when it works, without the fallback", async () => {
    const fake = fakeDocument();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyText(CODE)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledExactlyOnceWith(CODE);
    expect(fake.doc.execCommand).not.toHaveBeenCalled();
  });

  it("falls back when the Clipboard API rejects", async () => {
    const fake = fakeDocument();
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });

    await expect(copyText(CODE)).resolves.toBe("copied");
    expect(fake.doc.execCommand).toHaveBeenCalledExactlyOnceWith("copy");
    expect(fake.clipboard.data).toBe(CODE);
    expectCleanedUp(fake);
  });

  it("falls back when the Clipboard API is unavailable (plain HTTP)", async () => {
    const fake = fakeDocument();
    vi.stubGlobal("navigator", {});

    await expect(copyText(TRICKY)).resolves.toBe("copied");
    expect(fake.clipboard.data).toBe(TRICKY);
    expect(fake.textarea.value).toBe(TRICKY);
    expectCleanedUp(fake);
  });

  it("runs the fallback synchronously within the click when the API is missing", () => {
    const fake = fakeDocument();
    vi.stubGlobal("navigator", {});
    void copyText(CODE);
    // No await yet: the copy already happened, so the user's click still counts.
    expect(fake.doc.execCommand).toHaveBeenCalledOnce();
  });

  it("reports failure when both methods fail", async () => {
    const fake = fakeDocument({ execResult: false });
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });

    await expect(copyText(CODE)).resolves.toBe("failed");
    expect(fake.clipboard.data).toBeNull();
    expectCleanedUp(fake);
  });

  it("reports failure when execCommand throws", async () => {
    const fake = fakeDocument({ throws: true });
    vi.stubGlobal("navigator", {});

    await expect(copyText(CODE)).resolves.toBe("failed");
    expectCleanedUp(fake);
  });

  it("reports failure when there is no clipboard and no document", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", undefined);
    await expect(copyText(CODE)).resolves.toBe("failed");
  });
});

describe("copyWithExecCommand", () => {
  it("keeps the helper textarea hidden from assistive tech and off-screen", () => {
    const fake = fakeDocument();
    expect(copyWithExecCommand(CODE)).toBe(true);
    expect(fake.textarea.attributes).toMatchObject({ readonly: "", "aria-hidden": "true" });
    expect(fake.textarea.tabIndex).toBe(-1);
    expect(fake.textarea.style).toMatchObject({ position: "fixed", opacity: "0" });
    expect(fake.textarea.setSelectionRange).toHaveBeenCalledWith(0, CODE.length);
  });
});

describe("CopyButton", () => {
  it("shows Copy and has a descriptive accessible name", () => {
    const html = renderToStaticMarkup(<CopyButton text={CODE} what="Code example" />);
    const button = html.match(/<button[\s\S]*?<\/button>/)![0];
    expect(accessibleText(button).trim()).toBe("Copy code example");
    expect(button).toMatch(/>Copy<span class="sr-only"> code example<\/span>/);
  });
});
