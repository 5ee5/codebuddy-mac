import type { ReactNode } from "react";

export interface RadioCardOption<V extends string> {
  value: V;
  label: string;
  description?: ReactNode;
  /** Small extra content on the right, e.g. a difficulty meter. */
  meta?: ReactNode;
}

interface RadioCardsProps<V extends string> {
  name: string;
  legend: string;
  hint?: string;
  options: readonly RadioCardOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Grid classes for the option layout. */
  columns?: string;
}

/**
 * A native radio group (fieldset + legend + real radio inputs) styled as
 * selectable cards. Arrow keys, labelling and form semantics stay native; the
 * selected card takes the current mode's accent colour.
 */
export function RadioCards<V extends string>({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
  columns = "sm:grid-cols-3",
}: RadioCardsProps<V>) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <fieldset aria-describedby={hintId}>
      <legend className="text-sm font-semibold">{legend}</legend>
      {hint && (
        <p id={hintId} className="mt-1.5 text-sm leading-relaxed text-muted">
          {hint}
        </p>
      )}
      <div className={`mt-3 grid gap-2 ${columns}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className="group relative flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line-strong bg-surface p-3 transition-colors duration-150 hover:border-line-input has-checked:border-mode has-checked:bg-mode-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-line-input bg-surface group-has-checked:border-mode"
            >
              <span className="size-2 rounded-full bg-mode opacity-0 group-has-checked:opacity-100" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold">{option.label}</span>
                {option.meta}
              </span>
              {option.description && (
                <span className="text-sm leading-snug text-muted">{option.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
