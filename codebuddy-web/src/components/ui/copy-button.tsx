"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Copies `text` exactly as given, entirely in the browser.
 *
 * The Clipboard API only exists in secure contexts (https or localhost), so on
 * a plain-HTTP LAN address it is missing; it can also reject (permissions).
 * Either way we fall back to `execCommand("copy")`. When the API is missing,
 * the fallback runs before any `await`, so it still counts as part of the
 * click that browsers require for copying.
 */
export async function copyText(text: string): Promise<"copied" | "failed"> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (typeof clipboard?.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return "copied";
    } catch {
      // Fall through to the legacy path.
    }
  }
  return copyWithExecCommand(text) ? "copied" : "failed";
}

/**
 * Legacy copy: select the text in a temporary off-screen textarea and run
 * `execCommand("copy")`. A `copy` listener sets the clipboard data to the
 * exact string, because a textarea would turn CRLF into LF. Focus and the
 * previous selection are restored afterwards. Returns false if the browser
 * refuses or lacks the command; it never reports success it can't confirm.
 */
export function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }
  const previousFocus = document.activeElement as HTMLElement | null;
  const selection = document.getSelection();
  const previousRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i))
    : [];

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.tabIndex = -1;
  // Off-screen but selectable; 12pt stops iOS from zooming in on focus.
  Object.assign(textarea.style, {
    position: "fixed",
    top: "0",
    left: "-9999px",
    opacity: "0",
    fontSize: "12pt",
  });

  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
  };

  document.body.appendChild(textarea);
  document.addEventListener("copy", onCopy);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", onCopy);
    textarea.remove();
    if (selection) {
      selection.removeAllRanges();
      previousRanges.forEach((range) => selection.addRange(range));
    }
    previousFocus?.focus?.({ preventScroll: true });
  }
}

/**
 * Toolbar button that copies text and confirms the result. The visible label
 * stays "Copy"; screen readers hear what is copied, e.g. "Copy code example".
 */
export function CopyButton({ text, what }: { text: string; /** e.g. "Request" */ what: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function copy() {
    setState(await copyText(text));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded px-2 font-mono text-[11px] font-medium tracking-wide text-muted uppercase transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Icon name={state === "copied" ? "check" : "copy"} className="size-3.5" />
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
        {state !== "failed" && <span className="sr-only"> {what.toLowerCase()}</span>}
      </button>
      <span aria-live="polite" className="sr-only">
        {state === "copied"
          ? `${what} copied to clipboard`
          : state === "failed"
            ? "Copy failed. Select the text manually."
            : ""}
      </span>
    </>
  );
}
