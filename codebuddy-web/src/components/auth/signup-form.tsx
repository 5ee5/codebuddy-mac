"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useEffect } from "react";
import { FormMessage, SubmitButton } from "@/components/auth/form-parts";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";
import { Field } from "@/components/ui/field";
import { control, panel } from "@/components/ui/styles";
import { signUp } from "@/lib/auth/actions";
import { PASSWORD_MIN_LENGTH, type AuthFormState } from "@/lib/auth/validation";

const INITIAL: AuthFormState = {};

const FIELD_ORDER = [
  ["email", "signup-email"],
  ["password", "signup-password"],
  ["confirm", "signup-confirm"],
  ["classCode", "signup-class-code"],
] as const;

/** Email, password twice and the class code. The Server Action checks everything again. */
export function SignupForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [state, formAction, pending] = useActionState(signUp, INITIAL);

  // After a failed attempt, move focus to the first field that needs fixing.
  useEffect(() => {
    const first = FIELD_ORDER.find(([field]) => state.fieldErrors?.[field]);
    if (first) document.getElementById(first[1])?.focus();
  }, [state]);

  // Created, waiting for the confirmation link: show that instead of the form.
  if (state.unconfirmed && state.email) {
    return (
      <div className={`${panel} flex flex-col gap-5 p-5 sm:p-6`}>
        <h2 className="text-lg font-semibold">Check your email</h2>
        <FormMessage message={state.message} ok={state.ok} />
        <p className="text-sm leading-relaxed text-muted">
          Nothing there after a few minutes? Check your spam folder, or send the link again.
        </p>
        <ResendConfirmation email={state.email} />
      </div>
    );
  }

  return (
    <form noValidate action={formAction} className={panel}>
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-6 p-5 sm:p-6">
        <Field id="signup-email" label="Email" error={state.fieldErrors?.email}>
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
        <Field
          id="signup-password"
          label="Password"
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
        <Field id="signup-confirm" label="Type the password again" error={state.fieldErrors?.confirm}>
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
        <Field
          id="signup-class-code"
          label="Class code"
          hint="Your teacher gives you this code."
          error={state.fieldErrors?.classCode}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              name="classCode"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              className={`${control} min-h-11 font-mono`}
            />
          )}
        </Field>
        <FormMessage message={state.message} ok={state.ok} />
      </div>
      <SubmitButton pending={pending} label="Create account" pendingLabel="Creating your account…" />
    </form>
  );
}
