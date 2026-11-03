import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/signup-form";
import { eyebrow, panel } from "@/components/ui/styles";
import { isSignupOpen } from "@/lib/auth/signup";

export const metadata: Metadata = {
  title: "Create an account",
};

const link = "font-semibold text-ink underline underline-offset-4";

/** Decided per request, so changing the class code in `.env.local` takes effect after a restart, not a rebuild. */
async function SignupGate() {
  await connection();
  if (!isSignupOpen()) {
    return (
      <p className={`${panel} p-5 text-sm leading-relaxed text-muted`}>
        Sign-up isn’t open on this server. Ask the person running CodeBuddy to create an account
        for you.
      </p>
    );
  }
  return <SignupForm />;
}

export default function SignupPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-4 md:py-12">
      <div>
        <p className={eyebrow}>Account</p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">Create an account</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          You need the class code from your teacher. With an account you can use Learn and Debug,
          and your history and Practice progress are saved.
        </p>
      </div>
      <Suspense fallback={<div aria-hidden="true" className={`${panel} h-[34rem]`} />}>
        <SignupGate />
      </Suspense>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className={link}>
          Sign in
        </Link>
        . See{" "}
        <Link href="/privacy" className={link}>
          Privacy
        </Link>{" "}
        for what CodeBuddy stores.
      </p>
    </div>
  );
}
