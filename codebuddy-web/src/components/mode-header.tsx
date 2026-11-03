import { Icon } from "@/components/icons";
import type { ModeConfig } from "@/lib/modes";

/** Page heading for a mode; colours come from the parent's `data-mode`. */
export function ModeHeader({ mode }: { mode: ModeConfig }) {
  return (
    <div className="mb-8 border-b border-line pb-7 md:mb-10 md:pb-8">
      <p className="flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-mode uppercase">
        <Icon name={mode.icon} className="size-4" />
        {mode.tagline}
      </p>
      <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">{mode.label}</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
        {mode.description}
      </p>
    </div>
  );
}
