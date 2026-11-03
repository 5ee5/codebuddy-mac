import Link from "next/link";
import { Icon } from "@/components/icons";
import { buttonGhost } from "@/components/ui/styles";
import { signOut } from "@/lib/auth/actions";
import { getSignedInUser } from "@/lib/auth/server";

/*
 * Who is signed in, for the app shell (server component). It reads the
 * session cookie, so the shell renders it inside <Suspense>. On phones it is
 * a single link in the top bar; in the sidebar it also shows the email, a
 * link to History and a sign-out button.
 */

const link =
  "flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-surface-2";

export async function UserMenu() {
  const user = await getSignedInUser();

  if (!user) {
    return (
      <Link href="/login" className={link}>
        <Icon name="signIn" className="size-[18px] shrink-0" />
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1 md:flex-col md:items-stretch">
      <Link href="/account" className={link}>
        <Icon name="user" className="size-[18px] shrink-0" />
        <span className="md:hidden">Account</span>
        <span className="hidden truncate font-medium md:inline">{user.email ?? "Your account"}</span>
      </Link>
      <Link href="/history" className={`${link} hidden font-medium md:flex`}>
        <Icon name="file" className="size-[18px] shrink-0" />
        History
      </Link>
      <form action={signOut} className="hidden md:block">
        <button type="submit" className={`${buttonGhost} w-full justify-start px-2`}>
          <Icon name="signOut" className="size-4" />
          Sign out
        </button>
      </form>
    </div>
  );
}

/** Same footprint as the signed-out link, so the shell doesn't jump when the menu loads. */
export function UserMenuFallback() {
  return <span aria-hidden="true" className="block h-11 w-24" />;
}
