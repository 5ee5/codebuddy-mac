import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { CodeBlock } from "@/components/ui/code-block";
import { buttonInk, eyebrow } from "@/components/ui/styles";
import { MODES } from "@/lib/modes";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-4 md:py-12">
      <p className={eyebrow}>Error 404</p>
      <h1 className="font-display text-4xl font-semibold text-balance sm:text-5xl">
        We couldn&apos;t find that page
      </h1>
      <p className="text-lg leading-relaxed text-muted">
        The link may be broken, or the page may have moved. Even experienced programmers get
        this one sometimes.
      </p>
      <CodeBlock
        title="router.log"
        label="Error explanation"
        code={"GET <the address you followed>\n404 Not Found: no page lives here"}
        highlight={[2]}
      />
      <div>
        <Link href="/" className={buttonInk}>
          <Icon name="home" className="size-4" />
          Back to the home page
        </Link>
      </div>
      <nav aria-label="Modes" className="border-t border-line pt-6">
        <p className="text-sm font-semibold">Or jump straight into a mode</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {MODES.map((mode) => (
            <li key={mode.id} data-mode={mode.id}>
              <Link
                href={mode.href}
                className="flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold transition-colors duration-150 hover:border-mode hover:bg-mode-soft"
              >
                <Icon name={mode.icon} className="size-4 text-mode" />
                {mode.label}
                <span className="ml-auto text-xs font-normal text-muted">{mode.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
