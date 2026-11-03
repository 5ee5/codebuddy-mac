"use client";

import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Icon } from "@/components/icons";
import { buttonSecondary } from "@/components/ui/styles";
import { signInWithGitHub } from "@/lib/auth/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonSecondary} w-full`}>
      <Icon name={pending ? "spinner" : "github"} className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Opening GitHub…" : "Sign in with GitHub"}
    </button>
  );
}

/** For students who connected GitHub on their Account page. Keeps `?next=` like the email form. */
export function GitHubSignInButton() {
  const next = useSearchParams().get("next") ?? "/";
  return (
    <form action={signInWithGitHub}>
      <input type="hidden" name="next" value={next} />
      <Submit />
    </form>
  );
}
