import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DeleteAccountForm } from "@/components/auth/delete-account-form";
import { FormMessage } from "@/components/auth/form-parts";
import { PasswordForm } from "@/components/auth/password-form";
import { Icon } from "@/components/icons";
import { buttonSecondary, eyebrow, panel } from "@/components/ui/styles";
import { connectGitHub, disconnectGitHub, signOut } from "@/lib/auth/actions";
import { loginPathFor } from "@/lib/auth/paths";
import { isGitHubEnabled } from "@/lib/auth/providers";
import { getSignedInUser, getSupabase } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Account",
};

/** The signed-in email. The proxy already redirects signed-out visitors; this is the real check. */
async function SignedInAs() {
  const user = await getSignedInUser();
  if (!user) redirect(loginPathFor("/account"));
  return (
    <p className="mt-3 text-base leading-relaxed text-muted">
      Signed in as <strong className="font-semibold break-all text-ink">{user.email ?? "unknown email"}</strong>
    </p>
  );
}

/** Results of connecting GitHub, from `?github=` (set by /auth/callback and the actions). */
const GITHUB_MESSAGES: Record<string, { message: string; ok?: boolean }> = {
  connected: { message: "GitHub is connected. Next time you can use “Sign in with GitHub”.", ok: true },
  taken: { message: "That GitHub account is already connected to another CodeBuddy account." },
  failed: { message: "Connecting GitHub didn’t work. Try again in a little while." },
  disconnect_failed: { message: "GitHub couldn’t be disconnected right now. Try again in a little while." },
};

/** Connect or disconnect GitHub. Shown only once GitHub sign-in is switched on in Supabase. */
async function GitHubConnection({ searchParams }: { searchParams: Promise<{ github?: string | string[] }> }) {
  const [enabled, supabase, { github: status }] = await Promise.all([isGitHubEnabled(), getSupabase(), searchParams]);
  if (!enabled || !supabase) return null;
  const { data } = await supabase.auth.getUserIdentities();
  const identity = data?.identities.find((i) => i.provider === "github");
  const username = typeof identity?.identity_data?.user_name === "string" ? identity.identity_data.user_name : null;
  const result = typeof status === "string" ? GITHUB_MESSAGES[status] : undefined;

  return (
    <section aria-labelledby="github-title" className={`${panel} flex flex-col gap-4 p-5`}>
      <div>
        <h2 id="github-title" className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="github" className="size-5" />
          GitHub
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {identity
            ? `Connected${username ? ` as @${username}` : ""}. You can sign in with GitHub or with your password.`
            : "Connect your GitHub account to sign in with one click. Your password keeps working too."}
        </p>
      </div>
      <FormMessage message={result?.message} ok={result?.ok} />
      <form action={identity ? disconnectGitHub : connectGitHub}>
        <button type="submit" className={buttonSecondary}>
          <Icon name="github" className="size-4" />
          {identity ? "Disconnect GitHub" : "Connect GitHub"}
        </button>
      </form>
    </section>
  );
}

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-4 md:py-12">
      <div>
        <p className={eyebrow}>Account</p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">Your account</h1>
        <Suspense fallback={<p className="mt-3 h-7" aria-hidden="true" />}>
          <SignedInAs />
        </Suspense>
      </div>
      <Link
        href="/history"
        className={`${panel} flex min-h-11 items-center gap-3 p-5 font-semibold transition-colors duration-150 hover:bg-surface-2`}
      >
        <Icon name="file" className="size-5 shrink-0" />
        <span className="grow">
          History
          <span className="block text-sm font-normal text-muted">Your saved Learn and Debug answers</span>
        </span>
        <Icon name="arrowRight" className="size-4 text-muted" />
      </Link>
      <Suspense fallback={null}>
        <GitHubConnection searchParams={searchParams} />
      </Suspense>
      <PasswordForm />
      <form action={signOut}>
        <button type="submit" className={buttonSecondary}>
          <Icon name="signOut" className="size-4" />
          Sign out
        </button>
      </form>
      <DeleteAccountForm />
      <p className="text-sm text-muted">
        <Link href="/privacy" className="font-semibold text-ink underline underline-offset-4">
          Privacy
        </Link>
        : what CodeBuddy stores and for how long.
      </p>
    </div>
  );
}
