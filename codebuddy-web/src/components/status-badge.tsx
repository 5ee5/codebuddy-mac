/**
 * Quiet, persistent reminder of what is live: Learn and Debug answers come
 * from the AI; Practice checks answers locally, without AI. A status dot plus
 * text, noticeable without competing with page content.
 */
export function StatusBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide text-muted uppercase ${className}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-status" />
      AI live in Learn and Debug
    </span>
  );
}
