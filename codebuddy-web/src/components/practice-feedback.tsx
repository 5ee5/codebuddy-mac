import { Section } from "@/components/answer-parts";
import { Icon, type IconName } from "@/components/icons";
import { VERDICT_LABELS } from "@/lib/practice/check";
import type { CheckStatus, CheckVerdict, PracticeCheck } from "@/lib/practice/types";

const VERDICT_STYLE: Record<CheckVerdict, { border: string; icon: IconName; tone: string }> = {
  correct: { border: "border-success", icon: "check", tone: "text-success" },
  partial: { border: "border-status", icon: "info", tone: "text-status" },
  unverified: { border: "border-status", icon: "info", tone: "text-status" },
  incorrect: { border: "border-danger", icon: "alert", tone: "text-danger" },
};

/** Icon plus screen-reader prefix, so a status never relies on colour alone. */
const STATUS_STYLE: Record<CheckStatus, { icon: IconName; tone: string; prefix: string }> = {
  pass: { icon: "check", tone: "text-success", prefix: "Passed: " },
  fail: { icon: "cross", tone: "text-danger", prefix: "Not met: " },
  unverified: { icon: "info", tone: "text-muted", prefix: "Not checked: " },
};

const testStatus = (passed: boolean | null): CheckStatus =>
  passed === null ? "unverified" : passed ? "pass" : "fail";

function StatusIcon({ status }: { status: CheckStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <>
      <Icon name={style.icon} className={`mt-0.5 size-4 shrink-0 ${style.tone}`} />
      <span className="sr-only">{style.prefix}</span>
    </>
  );
}

/**
 * The result of checking a Practice answer. It says up front that the code
 * was read, not run, lists each requirement and test case with its outcome,
 * and offers one hint. It never shows a model solution.
 */
export function PracticeFeedback({ check, stale = false }: { check: PracticeCheck; stale?: boolean }) {
  const verdict = VERDICT_STYLE[check.verdict];

  return (
    <div className="flex flex-col gap-6">
      <div className={`border-l-2 ${verdict.border} bg-surface-2 px-4 py-3 text-sm leading-relaxed`}>
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <Icon name={verdict.icon} className={`size-5 shrink-0 ${verdict.tone}`} />
          {VERDICT_LABELS[check.verdict]}
        </p>
        <p className="mt-1">{check.summary}</p>
        <p className="mt-2 text-xs text-muted">
          CodeBuddy read your code and worked out the results from it. Your code was never run,
          and nothing was sent anywhere.
        </p>
      </div>

      {stale && (
        <p className="flex items-start gap-2 text-sm text-muted">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          You’ve changed your code since this check. Choose Check answer again to update it.
        </p>
      )}

      <Section title="Requirements">
        <ul className="flex flex-col gap-2.5 text-sm leading-relaxed">
          {check.checks.map((item) => (
            <li key={item.id} className="flex gap-2.5">
              <StatusIcon status={item.status} />
              <span>
                <span className="font-medium">{item.label}</span>
                {item.detail && <span className="block text-muted">{item.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {check.tests.length > 0 && (
        <Section title="Test cases">
          <ul className="divide-y divide-line border-y border-line text-sm leading-relaxed">
            {check.tests.map((test) => (
              <li key={test.label} className="flex gap-2.5 py-2.5">
                <StatusIcon status={testStatus(test.passed)} />
                <div className="min-w-0">
                  <p className="font-medium">{test.label}</p>
                  <p className="font-mono text-xs break-words text-muted">{test.call}</p>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 font-mono text-xs">
                    <dt className="text-muted">Expected</dt>
                    <dd className="break-words">{test.expected}</dd>
                    <dt className="text-muted">Your code</dt>
                    <dd className="break-words">
                      {test.actual ?? (
                        <span className="font-sans text-muted">Can’t tell without running it</span>
                      )}
                    </dd>
                  </dl>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {check.hint && (
        <Section title="Next hint">
          <p className="flex gap-2.5 text-sm leading-relaxed">
            <Icon name="lightbulb" className="mt-0.5 size-4 shrink-0 text-mode" />
            {check.hint}
          </p>
        </Section>
      )}
    </div>
  );
}
