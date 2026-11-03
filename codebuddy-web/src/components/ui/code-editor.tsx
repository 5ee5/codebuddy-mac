"use client";

import { useRef, type ComponentProps } from "react";
import { Icon } from "@/components/icons";

interface CodeEditorProps extends Omit<ComponentProps<"textarea">, "value"> {
  value: string;
  /** Caption in the toolbar, e.g. "solution.py". */
  title: string;
  /** Short language tag shown on the right of the toolbar. */
  language?: string;
}

/**
 * A plain <textarea> dressed as a small code editor: toolbar, line-number
 * gutter and monospace text. No editor library is involved, so it keeps all
 * native behaviour (labels, validation attributes, undo, mobile keyboards).
 * Lines don't wrap, so each gutter number matches exactly one line.
 */
export function CodeEditor({
  title,
  language,
  value,
  rows = 10,
  className = "",
  onScroll,
  ...props
}: CodeEditorProps) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;
  const gutterLines = Math.max(lineCount, rows);

  return (
    <div
      className={`overflow-hidden rounded-md border border-line-input bg-code transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus hover:border-ink/60 has-[textarea[aria-invalid=true]]:border-danger has-[textarea[aria-invalid=true]]:ring-1 has-[textarea[aria-invalid=true]]:ring-danger ${className}`}
    >
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-3">
        <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted">
          <Icon name="file" className="size-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </span>
        <span aria-hidden="true" className="flex items-center gap-3 font-mono text-[11px] text-subtle">
          <span className="tabular-nums">
            {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
          {language && <span className="font-medium tracking-wide uppercase">{language}</span>}
        </span>
      </div>
      <div className="relative flex">
        <div aria-hidden="true" className="w-11 shrink-0 overflow-hidden border-r border-line py-3 select-none">
          <div ref={gutterRef} className="pr-2.5 text-right font-mono text-[13px] leading-6 text-subtle">
            {Array.from({ length: gutterLines }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        </div>
        <textarea
          {...props}
          value={value}
          rows={rows}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          onScroll={(e) => {
            if (gutterRef.current) {
              gutterRef.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
            }
            onScroll?.(e);
          }}
          className="block min-h-24 w-full min-w-0 flex-1 resize-y bg-transparent px-3 py-3 font-mono text-base leading-6 text-ink placeholder:text-subtle focus-visible:outline-none sm:text-[13px]"
        />
      </div>
    </div>
  );
}
