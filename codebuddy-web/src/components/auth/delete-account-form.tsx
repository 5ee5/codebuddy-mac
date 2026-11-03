"use client";

import { useActionState, useEffect } from "react";
import { FormMessage } from "@/components/auth/form-parts";
import { Icon } from "@/components/icons";
import { Field } from "@/components/ui/field";
import { buttonSecondary, control, panel } from "@/components/ui/styles";
import { deleteAccount } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/validation";

const INITIAL: AuthFormState = {};

/**
 * Permanently deletes the account and everything saved with it. Kept behind
 * a <details> so it never sits open on the page, and it asks for the password
 * and a ticked box before anything happens.
 */
export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccount, INITIAL);

  useEffect(() => {
    const id = state.fieldErrors?.password ? "delete-password" : state.fieldErrors?.understood ? "delete-understood" : null;
    if (id) document.getElementById(id)?.focus();
  }, [state]);

  return (
    <details className={`${panel} group`} open={Boolean(state.fieldErrors || state.message) || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold [&::-webkit-details-marker]:hidden">
        Delete your account
        <Icon
          name="chevronDown"
          className="size-4 text-muted transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <form noValidate action={formAction} className="flex flex-col gap-6 border-t border-line p-5">
        <p className="text-sm leading-relaxed text-muted">
          This deletes your account straight away, together with your history and Practice progress.
          It can’t be undone. To use CodeBuddy again, you’d need a new account.
        </p>
        <Field id="delete-password" label="Your password" error={state.fieldErrors?.password}>
          {(props) => (
            <input
              {...props}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className={`${control} min-h-11`}
            />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3 text-sm leading-relaxed">
            <input
              id="delete-understood"
              type="checkbox"
              name="understood"
              aria-invalid={state.fieldErrors?.understood ? true : undefined}
              aria-describedby={state.fieldErrors?.understood ? "delete-understood-error" : undefined}
              className="mt-0.5 size-5 shrink-0 accent-danger"
            />
            I understand that my account, history and Practice progress will be deleted for good.
          </label>
          {state.fieldErrors?.understood && (
            <p id="delete-understood-error" className="flex items-start gap-1.5 text-sm font-medium text-danger">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              {state.fieldErrors.understood}
            </p>
          )}
        </div>
        <FormMessage message={state.message} ok={state.ok} />
        <div>
          <button
            type="submit"
            disabled={pending}
            className={`${buttonSecondary} border-danger text-danger hover:border-danger hover:bg-danger hover:text-surface`}
          >
            {pending && <Icon name="spinner" className="size-4 animate-spin" />}
            {pending ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </form>
    </details>
  );
}
