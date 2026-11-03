import { AnswerMeta, Paragraphs, RichText, Section } from "@/components/answer-parts";
import { Icon, type IconName } from "@/components/icons";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import type { AssistantAnswer, DebugRequest } from "@/lib/assistant/types";
import { LANGUAGE_EXTENSIONS, LANGUAGE_LABELS } from "@/lib/languages";

function ItemList({ items, icon }: { items: readonly string[]; icon: IconName }) {
  return (
    <ul className="flex flex-col gap-2 text-sm leading-relaxed">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <Icon name={icon} className="mt-0.5 size-4 shrink-0 text-mode" />
          <span>
            <RichText text={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A validated Debug answer from the AI. It states up front that the code was
 * read, not run, and keeps confirmed facts apart from unconfirmed guesses.
 */
export function DebugAnswer({ answer }: { answer: AssistantAnswer<DebugRequest> }) {
  const { response } = answer;
  const needsMoreInfo = response.outcome === "needs_more_info";
  const fix = response.correctedCode;

  return (
    <div className="flex flex-col gap-6">
      <div className="border-l-2 border-mode bg-mode-soft px-4 py-3 text-sm leading-relaxed">
        <AnswerMeta model={answer.model} createdAt={answer.createdAt} />
        <p className="mt-1 text-muted">
          CodeBuddy read your code but did not run or test it. AI can make mistakes, so try the
          fix yourself.
        </p>
      </div>

      {needsMoreInfo && (
        <div className="border-l-2 border-status bg-surface-2 px-4 py-3 text-sm leading-relaxed">
          <p className="flex items-start gap-2 font-semibold">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            More information needed
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-10">
            {response.missingInfo.map((item, i) => (
              <li key={i}>
                <RichText text={item} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section title={needsMoreInfo ? "Not enough information yet" : "Likely problem"}>
        <p className="font-medium leading-relaxed">
          <RichText text={response.diagnosis} />
        </p>
      </Section>

      <Section title="Explanation">
        <Paragraphs text={response.explanation} />
      </Section>

      {response.confirmed.length > 0 && (
        <Section title="What’s certain">
          <ItemList items={response.confirmed} icon="check" />
        </Section>
      )}

      {response.hypotheses.length > 0 && (
        <Section title="Possible causes (not confirmed)">
          <ItemList items={response.hypotheses} icon="info" />
        </Section>
      )}

      {fix && (
        <Section title="Corrected code">
          <CodeBlock
            title={`fixed.${LANGUAGE_EXTENSIONS[fix.language]}`}
            language={LANGUAGE_LABELS[fix.language]}
            label="Corrected code"
            code={fix.code}
            actions={<CopyButton text={fix.code} what="Corrected code" />}
          />
        </Section>
      )}

      {response.changes.length > 0 && (
        <Section title="Changes explained">
          <ol className="divide-y divide-line border-y border-line text-sm leading-relaxed">
            {response.changes.map((item, i) => (
              <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-x-1 py-2.5">
                <span aria-hidden="true" className="font-mono text-xs text-subtle tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="font-medium">
                    <RichText text={item.change} />
                  </p>
                  <p className="mt-0.5 text-muted">
                    <span className="sr-only">Why: </span>
                    <RichText text={item.reason} />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Always present (the contract requires at least one step), including
          what to try while gathering missing details. */}
      <Section title="Next steps">
        <ItemList items={response.nextSteps} icon="arrowRight" />
      </Section>
    </div>
  );
}
