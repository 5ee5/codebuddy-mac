import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonInk, eyebrow, panel } from "@/components/ui/styles";
import { confirmEmailLink } from "@/lib/auth/actions";

export const metadata: Metadata = {
  title: "Continue",
};

const COPY = {
  email: {
    heading: "Confirm your email",
    body: "Click Continue to confirm your email address and finish creating your CodeBuddy account.",
  },
  recovery: {
    heading: "Reset your password",
    body: "Click Continue, then choose a new password.",
  },
} as const;

/*
 * Links in CodeBuddy's emails open this page. The one-time token is only used
 * when the student clicks Continue (a POST), so mail scanners that open links
 * to check them can't use it up first.
 */
async function ConfirmPrompt({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token_hash: tokenHash, type } = await searchParams;
  if (typeof tokenHash !== "string" || (type !== "email" && type !== "recovery")) {
    return (
      <div className={`${panel} flex flex-col gap-4 p-5 text-sm leading-relaxed text-muted`}>
        <p>This link isn’t complete. Open it straight from the email, or ask for a new one.</p>
        <p>
          <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
            Go to sign in
          </Link>
        </p>
      </div>
    );
  }
  const copy = COPY[type];
  return (
    <>
      <div>
        <p className={eyebrow}>Account</p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">{copy.heading}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">{copy.body}</p>
      </div>
      <form action={confirmEmailLink}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <button type="submit" className={buttonInk}>
          Continue
        </button>
      </form>
    </>
  );
}

export default function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-4 md:py-12">
      <Suspense fallback={<div aria-hidden="true" className={`${panel} h-48`} />}>
        <ConfirmPrompt searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
