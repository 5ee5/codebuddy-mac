import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { buttonPrimary } from "@/components/ui/styles";

interface FormFooterProps {
  pending: boolean;
  secondary: ReactNode;
  /** Submit text; preview-only modes keep the default. */
  label?: string;
  pendingLabel?: string;
}

/**
 * Shared action bar for every workspace form: a secondary action and submit.
 * The submit button is disabled while pending, so a paid request can't be
 * sent twice by double-clicking.
 */
export function FormFooter({
  pending,
  secondary,
  label = "Preview request",
  pendingLabel = "Preparing…",
}: FormFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-5 py-4 sm:px-6">
      {secondary}
      <button type="submit" disabled={pending} className={`${buttonPrimary} grow sm:grow-0`}>
        <Icon name={pending ? "spinner" : "send"} className={`size-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}
