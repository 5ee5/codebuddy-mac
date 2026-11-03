import type { ReactNode } from "react";
import { Icon } from "@/components/icons";

interface CodeBlockProps {
  code: string;
  /** Caption in the toolbar, e.g. a file name. */
  title: string;
  /** Short language tag shown on the right of the toolbar. */
  language?: string;
  /** 1-based line numbers to highlight, e.g. the line an error points at. */
  highlight?: readonly number[];
  /** Extra toolbar content, such as a copy button. */
  actions?: ReactNode;
  /** Accessible name for the scrollable code region. */
  label?: string;
  className?: string;
}

/** Visible lines of `code`: a single trailing newline doesn't start a new line. */
export function codeLines(code: string): string[] {
  const lines = code.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Read-only code with an editor-like toolbar and line numbers.
 *
 * The code is rendered as one unmodified text string, so its newlines and
 * indentation survive copying, screen readers and text extraction, not just
 * CSS layout. Line numbers and highlight bars are separate `aria-hidden`
 * layers; `pre` never wraps, so both line up at 1.5rem (`leading-6`) per line.
 */
export function CodeBlock({
  code,
  title,
  language,
  highlight = [],
  actions,
  label,
  className = "",
}: CodeBlockProps) {
  const lines = codeLines(code);

  return (
    <div className={`overflow-hidden rounded-md border border-line bg-code ${className}`}>
      {/* The {" "} text keeps the parts apart in the page text; flex layout ignores it. */}
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-3">
        <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted">
          <Icon name="file" className="size-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </span>{" "}
        <span className="flex items-center gap-2">
          {language && (
            <span className="font-mono text-[11px] font-medium tracking-wide text-subtle uppercase">
              <span className="sr-only">Language: </span>
              {language}
            </span>
          )}
          {language && actions && (
            <>
              {" "}
              <span aria-hidden="true" className="h-4 w-px bg-line" />{" "}
            </>
          )}
          {actions}
        </span>
      </div>
      <div
        tabIndex={0}
        role="region"
        aria-label={label ?? title}
        className="isolate flex overflow-x-auto py-3 font-mono text-[13px] leading-6"
      >
        <div aria-hidden="true" className="sticky left-0 z-10 shrink-0 bg-code pr-3 pl-3 text-right text-subtle select-none">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="relative min-w-max flex-1 pr-4">
          {highlight.map((line) => (
            <span
              key={line}
              aria-hidden="true"
              data-highlight-line={line}
              className="absolute -left-1 right-3 h-6 rounded-sm bg-highlight"
              style={{ top: `calc(${line - 1} * 1.5rem)` }}
            />
          ))}
          <code className="relative">{code}</code>
        </pre>
      </div>
    </div>
  );
}
