import type { Metadata } from "next";
import Link from "next/link";
import { PasswordForm } from "@/components/auth/password-form";
import { eyebrow } from "@/components/ui/styles";

export const metadata: Metadata = {
  title: "Choose a new password",
};

/** Reached from a password-reset link, which has already signed the student in. */
export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-4 md:py-12">
      <div>
        <p className={eyebrow}>Account</p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">Choose a new password</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Your reset link worked and you’re signed in. Pick a new password to finish.
        </p>
      </div>
      <PasswordForm title="New password" description="You’ll use it the next time you sign in." />
      <p className="text-sm text-muted">
        Done?{" "}
        <Link href="/learn" className="font-semibold text-ink underline underline-offset-4">
          Go to Learn
        </Link>
      </p>
    </div>
  );
}
