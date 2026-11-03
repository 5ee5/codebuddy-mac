/*
 * Shared Tailwind class strings. Kept as literals so Tailwind can detect
 * them; `bg-mode`/`text-mode` pick up the accent of the nearest `data-mode`.
 */
const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-[background-color,border-color,color,opacity] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60";

/** Mode-coloured call to action inside a workspace. */
export const buttonPrimary = `${buttonBase} bg-mode text-mode-ink hover:opacity-90`;

/** Ink call to action, used outside a mode (home page, 404). */
export const buttonInk = `${buttonBase} bg-brand text-brand-ink hover:opacity-85`;

export const buttonSecondary = `${buttonBase} border border-line-strong bg-surface text-ink hover:border-line-input hover:bg-surface-2`;

/** Quiet text button for low-emphasis actions such as "Clear". */
export const buttonGhost = `${buttonBase} px-3 text-muted hover:bg-surface-2 hover:text-ink`;

/** Bordered surface. Deliberately flat: hairline border, small radius, no shadow. */
export const panel = "rounded-lg border border-line bg-surface";

/** Small monospace label used for eyebrows and toolbar captions. */
export const eyebrow = "font-mono text-xs font-medium tracking-wide text-muted uppercase";

export const control =
  "block w-full rounded-md border border-line-input bg-surface px-3 py-2.5 text-base text-ink placeholder:text-subtle transition-colors hover:border-ink/60 aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger";
