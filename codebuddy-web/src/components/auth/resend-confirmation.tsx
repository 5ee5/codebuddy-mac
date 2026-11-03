"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/auth/form-parts";
import { Icon } from "@/components/icons";
import { buttonSecondary } from "@/components/ui/styles";
import { resendConfirmation } from "@/lib/auth/actions";
import type { AuthFormState } from "@/lib/auth/validation";

const INITIAL: AuthFormState = {};

/** "Send it again" for a confirmation email, for the email the student already typed. */
export function ResendConfirmation({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(resendConfirmation, INITIAL);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="email" value={email} />
      <FormMessage message={state.message ?? state.fieldErrors?.email} ok={state.ok} />
      <div>
        <button type="submit" disabled={pending} className={buttonSecondary}>
          <Icon name={pending ? "spinner" : "send"} className={`size-4 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Sending…" : "Send it again"}
        </button>
      </div>
    </form>
  );
}
