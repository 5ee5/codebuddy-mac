"use client";

import { useActionState, useEffect } from "react";
import { FormMessage, SubmitButton } from "@/components/auth/form-parts";
import { Field } from "@/components/ui/field";
import { control, panel } from "@/components/ui/styles";
import { requestPasswordReset } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/validation";

const INITIAL: AuthFormState = {};

/** Asks for the account's email and sends a reset link to it. */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, INITIAL);

  useEffect(() => {
    if (state.fieldErrors?.email) document.getElementById("forgot-email")?.focus();
  }, [state]);

  return (
    <form noValidate action={formAction} className={panel}>
      <div className="flex flex-col gap-6 p-5 sm:p-6">
        <Field id="forgot-email" label="Email" error={state.fieldErrors?.email}>
          {(props) => (
            <input
              {...props}
              type="email"
              name="email"
              autoComplete="email"
              spellCheck={false}
              required
              defaultValue={state.email}
              className={`${control} min-h-11`}
            />
          )}
        </Field>
        <FormMessage message={state.message} ok={state.ok} />
      </div>
      <SubmitButton pending={pending} label="Send reset link" pendingLabel="Sending…" />
    </form>
  );
}
