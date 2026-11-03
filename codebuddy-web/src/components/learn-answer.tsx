import { AnswerMeta, Paragraphs, RichText, Section } from "@/components/answer-parts";
import { Icon } from "@/components/icons";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import type { AssistantAnswer, LearnRequest } from "@/lib/assistant/types";
import { LANGUAGE_EXTENSIONS, LANGUAGE_LABELS } from "@/lib/languages";

export { answerMeta, type MetaPart } from "@/components/answer-parts";

/** A validated Learn answer from the AI, with its provenance stated up front. */
export function LearnAnswer({ answer }: { answer: AssistantAnswer<LearnRequest> }) {
  const { response } = answer;

  return (
    <div className="flex flex-col gap-6">
      <div className="border-l-2 border-mode bg-mode-soft px-4 py-3 text-sm leading-relaxed">
        <AnswerMeta model={answer.model} createdAt={answer.createdAt} />
        <p className="mt-1 text-muted">
          AI can make mistakes. Run the example yourself and check anything that seems off.
        </p>
      </div>

      <Section title="Explanation">
        <Paragraphs text={response.explanation} />
      </Section>

      {response.example && (
        <Section title="Code example">
          <CodeBlock
            title={`example.${LANGUAGE_EXTENSIONS[response.example.language]}`}
            language={LANGUAGE_LABELS[response.example.language]}
            label="Code example"
            code={response.example.code}
            actions={<CopyButton text={response.example.code} what="Code example" />}
          />
        </Section>
      )}

      <Section title="Key points">
        <ul className="flex flex-col gap-2 text-sm leading-relaxed">
          {response.keyPoints.map((point, i) => (
            <li key={i} className="flex gap-2.5">
              <Icon name="check" className="mt-0.5 size-4 shrink-0 text-mode" />
              <span>
                <RichText text={point} />
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {response.followUpQuestions.length > 0 && (
        <Section title="Follow-up questions">
          <ul className="divide-y divide-line border-y border-line text-sm">
            {response.followUpQuestions.map((question, i) => (
              <li key={i} className="flex gap-2 py-2.5">
                <span aria-hidden="true" className="font-mono text-mode">
                  ›
                </span>
                <span>
                  <RichText text={question} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
