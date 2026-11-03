import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { buttonInk, eyebrow } from "@/components/ui/styles";

export const metadata: Metadata = {
  title: "Account deleted",
};

export default function GoodbyePage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-4 md:py-12">
      <div>
        <p className={eyebrow}>Account</p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">Your account is deleted</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Your account, your history and your Practice progress have been removed, and you’ve been
          signed out. Practice still works without an account.
        </p>
      </div>
      <div>
        <Link href="/" className={buttonInk}>
          <Icon name="home" className="size-4" />
          Back to the home page
        </Link>
      </div>
    </div>
  );
}
