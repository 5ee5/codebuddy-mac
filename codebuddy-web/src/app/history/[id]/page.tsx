import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DebugAnswer } from "@/components/debug-answer";
import { Icon } from "@/components/icons";
import { LearnAnswer } from "@/components/learn-answer";
import { CodeBlock } from "@/components/ui/code-block";
import { buttonGhost, eyebrow, panel } from "@/components/ui/styles";
import { getHistoryEntry } from "@/lib/db/ai-requests";
import { deleteHistoryEntry } from "@/lib/db/history-actions";
import { LANGUAGE_EXTENSIONS, LANGUAGE_LABELS } from "@/lib/languages";
import { getMode } from "@/lib/modes";

export const metadata: Metadata = {
  title: "Saved answer",
};

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short" });

async function Entry({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = await getHistoryEntry(id);
  if (!entry) notFound();
  const mode = getMode(entry.mode);

  return (
    <div data-mode={entry.mode} className="flex flex-col gap-6">
      <div>
        <p className="flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-mode uppercase">
          <Icon name={mode.icon} className="size-4" />
          {mode.label} · {dateFormat.format(new Date(entry.answer.createdAt))}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold text-balance break-words sm:text-4xl">
          {entry.mode === "learn" ? entry.request.question : "Debug session"}
        </h1>
      </div>

      {entry.mode === "debug" && (
        <section className="flex flex-col gap-4" aria-label="What you sent">
          <CodeBlock
            title={`main.${LANGUAGE_EXTENSIONS[entry.request.language]}`}
            language={LANGUAGE_LABELS[entry.request.language]}
            label="Your code"
            code={entry.request.code}
          />
          <CodeBlock title="error or description" label="Your problem description" code={entry.request.problem} />
        </section>
      )}

      <section className={`${panel} p-5`} aria-label="CodeBuddy’s answer">
        {entry.mode === "learn" ? <LearnAnswer answer={entry.answer} /> : <DebugAnswer answer={entry.answer} />}
      </section>

      <form action={deleteHistoryEntry}>
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="from" value="entry" />
        <button type="submit" className={buttonGhost}>
          <Icon name="cross" className="size-4" />
          Delete from history
        </button>
      </form>
    </div>
  );
}

export default function HistoryEntryPage({ params }: PageProps<"/history/[id]">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-4 md:py-12">
      <Link href="/history" className={`${eyebrow} flex min-h-11 items-center gap-1.5 hover:text-ink`}>
        <Icon name="arrowRight" className="size-3.5 rotate-180" />
        All history
      </Link>
      <Suspense fallback={<div aria-hidden="true" className={`${panel} h-96`} />}>
        <Entry params={params} />
      </Suspense>
    </div>
  );
}
