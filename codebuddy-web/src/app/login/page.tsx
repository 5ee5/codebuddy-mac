import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GitHubSignInButton } from "@/components/auth/github-button";
import { LoginForm } from "@/components/auth/login-form";
import { eyebrow, panel } from "@/components/ui/styles";
import { isGitHubEnabled } from "@/lib/auth/providers";

export const metadata: Metadata = {
  title: "Sign in",
};

/** Shown only once GitHub sign-in is switched on in Supabase. */
async function GitHubSignIn() {
  if (!(await isGitHubEnabled())) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-3 text-xs text-muted uppercase before:h-px before:grow before:bg-line after:h-px after:grow after:bg-line">
        or
      </p>
      <GitHubSignInButton />
      <p className="text-xs leading-relaxed text-muted">
        Works once you’ve connected GitHub on your Account page.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-4 md:py-12">
      <div>
        <p className={eyebrow}>Account</p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">Sign in</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Learn and Debug use a paid AI service, so they need an account.{" "}
          <Link href="/signup" className="font-semibold text-ink underline underline-offset-4">
            Create one
          </Link>{" "}
          with the class code from your teacher.{" "}
          <Link href="/practice" className="font-semibold text-ink underline underline-offset-4">
            Practice
          </Link>{" "}
          works without signing in.
        </p>
      </div>
      {/* The form reads `?next=` from the URL, which is only known at request time. */}
      <Suspense fallback={<div aria-hidden="true" className={`${panel} h-80`} />}>
        <LoginForm />
      </Suspense>
      <p className="text-sm">
        <Link href="/forgot-password" className="font-semibold text-ink underline underline-offset-4">
          Forgot your password?
        </Link>
      </p>
      <Suspense fallback={null}>
        <GitHubSignIn />
      </Suspense>
      <p className="text-sm text-muted">
        <Link href="/privacy" className="font-semibold text-ink underline underline-offset-4">
          Privacy
        </Link>
        : what CodeBuddy stores about you and for how long.
      </p>
    </div>
  );
}
