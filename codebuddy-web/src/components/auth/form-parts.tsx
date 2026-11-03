import { Icon } from "@/components/icons";
import { buttonInk } from "@/components/ui/styles";

/** Form-level result: an error or a confirmation, announced to screen readers. */
export function FormMessage({ message, ok }: { message?: string; ok?: boolean }) {
  return (
    <div aria-live="polite">
      {message && (
        <p
          className={`flex items-start gap-2 border-l-2 bg-surface-2 px-4 py-3 text-sm leading-relaxed ${
            ok ? "border-status" : "border-danger"
          }`}
        >
          <Icon
            name={ok ? "check" : "alert"}
            className={`mt-0.5 size-4 shrink-0 ${ok ? "text-status" : "text-danger"}`}
          />
          {message}
        </p>
      )}
    </div>
  );
}

/** Disabled while the action runs, so the form can't be sent twice. */
export function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <div className="flex justify-end border-t border-line bg-surface-2/40 px-5 py-4 sm:px-6">
      <button type="submit" disabled={pending} className={`${buttonInk} grow sm:grow-0`}>
        {pending && <Icon name="spinner" className="size-4 animate-spin" />}
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}
