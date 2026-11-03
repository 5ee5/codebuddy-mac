import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { eyebrow, panel } from "@/components/ui/styles";
import { emailEnabled } from "@/lib/auth/email-links";

export const metadata: Metadata = {
  title: "Forgot password",
};

/** Decided per request, so adding the email settings takes effect after a restart, not a rebuild. */
async function ResetGate() {
  await connection();
  if (!emailEnabled()) {
    return (
      <p className={`${panel} p-5 text-sm leading-relaxed text-muted`}>
        Password reset by email isn’t set up on this server. Ask the person running CodeBuddy to
        help you.
      </p>
    );
  }
  return <ForgotPasswordForm />;
}

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-4 md:py-12">
      <div>
        <p className={eyebrow}>Account</p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">Forgot your password?</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Enter the email you use for CodeBuddy and we’ll send you a link to choose a new password.
        </p>
      </div>
      <Suspense fallback={<div aria-hidden="true" className={`${panel} h-56`} />}>
        <ResetGate />
      </Suspense>
      <p className="text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
