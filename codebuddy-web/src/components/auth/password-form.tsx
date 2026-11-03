"use client";

import { useActionState, useEffect } from "react";
import { FormMessage, SubmitButton } from "@/components/auth/form-parts";
import { Field } from "@/components/ui/field";
import { control, panel } from "@/components/ui/styles";
import { changePassword } from "@/lib/auth/actions";
import { PASSWORD_MIN_LENGTH, type AuthFormState } from "@/lib/auth/validation";

const INITIAL: AuthFormState = {};

interface PasswordFormProps {
  title?: string;
  description?: string;
}

/** New password, typed twice: on the Account page, and after a password-reset link. */
export function PasswordForm({
  title = "Change your password",
  description = "If someone gave you your first password, replace it with one only you know.",
}: PasswordFormProps) {
  const [state, formAction, pending] = useActionState(changePassword, INITIAL);

  useEffect(() => {
    const id = state.fieldErrors?.password ? "new-password" : state.fieldErrors?.confirm ? "confirm-password" : null;
    if (id) document.getElementById(id)?.focus();
  }, [state]);

  return (
    <form noValidate action={formAction} className={panel} aria-labelledby="password-title">
      <div className="flex flex-col gap-6 p-5 sm:p-6">
        <div>
          <h2 id="password-title" className="text-lg font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        </div>
        <Field
          id="new-password"
          label="New password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={state.fieldErrors?.password}
        >
          {(props) => (
            <input
              {...props}
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              className={`${control} min-h-11`}
            />
          )}
        </Field>
        <Field id="confirm-password" label="Type it again" error={state.fieldErrors?.confirm}>
          {(props) => (
            <input
              {...props}
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              className={`${control} min-h-11`}
            />
          )}
        </Field>
        <FormMessage message={state.message} ok={state.ok} />
      </div>
      <SubmitButton pending={pending} label="Change password" pendingLabel="Saving…" />
    </form>
  );
}
