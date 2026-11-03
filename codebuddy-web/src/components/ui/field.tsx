import type { ComponentProps, ReactNode } from "react";
import { Icon } from "@/components/icons";
import { control } from "@/components/ui/styles";

/** Accessibility props a form control needs to be tied to its hint and error. */
export interface ControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  /** Extra content shown on the label row, e.g. a character counter. */
  aside?: ReactNode;
  children: (controlProps: ControlProps) => ReactNode;
}

/**
 * Label + control + hint + error, wired together with `htmlFor`,
 * `aria-describedby` and `aria-invalid` so screen readers announce the hint
 * and any validation message when the control receives focus.
 */
export function Field({ id, label, hint, error, optional, aside, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
          {optional && <span className="ml-1.5 text-xs font-normal text-muted">optional</span>}
        </label>
        {aside}
      </div>
      {hint && (
        <p id={hintId} className="mb-1 text-sm leading-relaxed text-muted">
          {hint}
        </p>
      )}
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error && (
        <p id={errorId} className="mt-0.5 flex items-start gap-1.5 text-sm font-medium text-danger">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Native <select> with a consistent look and a custom chevron. */
export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`${control} min-h-11 cursor-pointer appearance-none pr-10 ${className}`}
      />
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
