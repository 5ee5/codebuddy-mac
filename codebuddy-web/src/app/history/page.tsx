import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { buttonGhost, buttonSecondary, eyebrow, panel } from "@/components/ui/styles";
import { getMode } from "@/lib/modes";
import { listHistory } from "@/lib/db/ai-requests";
import { clearAllHistory, deleteHistoryEntry } from "@/lib/db/history-actions";

export const metadata: Metadata = {
  title: "History",
};

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

async function HistoryList() {
  const entries = await listHistory();

  if (entries === null) {
    return (
      <p className="border-l-2 border-danger bg-surface-2 px-4 py-3 text-sm leading-relaxed">
        Your history couldn’t be loaded right now. Try again in a little while.
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <div className={`${panel} p-6 text-sm leading-relaxed text-muted`}>
        Nothing here yet. Answers from{" "}
        <Link href="/learn" className="font-semibold text-ink underline underline-offset-4">
          Learn
        </Link>{" "}
        and{" "}
        <Link href="/debug" className="font-semibold text-ink underline underline-offset-4">
          Debug
        </Link>{" "}
        are saved here for 90 days.
      </div>
    );
  }

  return (
    <>
      <ul className={`${panel} divide-y divide-line`}>
        {entries.map((entry) => {
          const mode = getMode(entry.mode);
          return (
            <li key={entry.id} data-mode={entry.mode} className="flex items-center gap-2 px-3 py-2 sm:px-4">
              <Link
                href={`/history/${entry.id}`}
                className="flex min-h-11 min-w-0 grow items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-surface-2"
              >
                <Icon name={mode.icon} className="size-[18px] shrink-0 text-mode" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{entry.title}</span>
                  <span className="text-xs text-muted">
                    {mode.label} · {dateFormat.format(new Date(entry.createdAt))}
                  </span>
                </span>
              </Link>
              <form action={deleteHistoryEntry}>
                <input type="hidden" name="id" value={entry.id} />
                <button type="submit" className={buttonGhost} aria-label={`Delete “${entry.title}”`}>
                  <Icon name="cross" className="size-4" />
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      {/* A second click is needed, so one slip can't wipe everything. */}
      <details className="text-sm">
        <summary className={`${buttonGhost} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          Clear all history…
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-muted">This removes every saved question and answer. It can’t be undone.</p>
          <form action={clearAllHistory}>
            <button type="submit" className={buttonSecondary}>
              Yes, clear everything
            </button>
          </form>
        </div>
      </details>
    </>
  );
}

export default function HistoryPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-4 md:py-12">
      <div>
        <p className={eyebrow}>Account</p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">History</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Your Learn questions and Debug sessions from the last 90 days. Only you can see them.
        </p>
      </div>
      <Suspense fallback={<div aria-hidden="true" className={`${panel} h-64`} />}>
        <HistoryList />
      </Suspense>
    </div>
  );
}
