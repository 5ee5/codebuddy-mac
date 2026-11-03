import Link from "next/link";
import { Icon } from "@/components/icons";
import { CodeBlock } from "@/components/ui/code-block";
import { buttonInk, buttonSecondary, eyebrow } from "@/components/ui/styles";
import { MODES } from "@/lib/modes";

const EXAMPLE_CODE = `numbers = [10, 20, 30]

for i in range(4):
    print(numbers[i])
`;

const PRINCIPLES = [
  {
    title: "Explains, not just answers",
    body: "Every answer says why, so you can solve the next problem on your own.",
  },
  {
    title: "Meets you at your level",
    body: "Tell CodeBuddy how much you know and it adjusts its words and examples.",
  },
  {
    title: "Hints before solutions",
    body: "In Practice, hints come one at a time, so you still get to solve it yourself.",
  },
];

export default function HomePage() {
  return (
    <div data-mode="home" className="flex flex-col gap-20 md:gap-28">
      {/* Hero */}
      <section
        aria-labelledby="home-title"
        className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-14"
      >
        <div>
          <p className={eyebrow}>Programming tutor for beginners</p>
          <h1
            id="home-title"
            className="font-display mt-4 text-[2.5rem] leading-[1.08] font-semibold text-balance sm:text-[3.4rem]"
          >
            Stuck on your code? Let&apos;s work it out <span className="mark">together</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            CodeBuddy explains programming the way a patient teacher would. It reads your code,
            points at the line that matters and tells you why, in plain language and at your
            level.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/learn" className={`${buttonInk} px-5`}>
              Ask a question
              <Icon name="arrowRight" className="size-4" />
            </Link>
            <Link href="/debug" className={`${buttonSecondary} px-5`}>
              Paste an error
            </Link>
          </div>
        </div>

        <figure className="flex flex-col gap-3">
          <CodeBlock
            title="loop.py"
            language="Python"
            label="Example code with a bug on line 4"
            code={EXAMPLE_CODE}
            highlight={[4]}
          />
          {/* The tutor's margin note, attached to the highlighted line. */}
          <div data-mode="debug" className="ml-4 border-l-2 border-mode bg-surface px-4 py-3.5 sm:ml-10">
            <p className="font-mono text-[11px] font-medium tracking-wide text-mode uppercase">
              Line 4 · IndexError
            </p>
            <p className="mt-1.5 text-sm leading-relaxed">
              <code className="font-mono text-[13px]">range(4)</code> counts 0, 1, 2, 3, but your
              list only has positions 0, 1 and 2. Try{" "}
              <code className="font-mono text-[13px]">range(len(numbers))</code>, or loop over the
              list directly with <code className="font-mono text-[13px]">for n in numbers</code>.
            </p>
          </div>
          <figcaption className="flex items-center gap-1.5 text-xs text-muted">
            <Icon name="info" className="size-3.5" />
            Illustrative example. Real Debug answers come from Claude and aren&apos;t run or tested.
          </figcaption>
        </figure>
      </section>

      {/* Modes */}
      <section aria-labelledby="home-modes-title">
        <p className={eyebrow}>Three ways in</p>
        <h2 id="home-modes-title" className="font-display mt-3 text-3xl font-semibold sm:text-4xl">
          Pick the help you need right now
        </h2>
        <ul className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {MODES.map((mode, i) => (
            <li key={mode.id} data-mode={mode.id} className="flex flex-col border-t-2 border-mode pt-5">
              <p className="flex items-center gap-2 font-mono text-xs font-medium tracking-wide text-mode uppercase">
                <Icon name={mode.icon} className="size-4" />
                {String(i + 1).padStart(2, "0")} · {mode.label}
              </p>
              <h3 className="font-display mt-3 text-2xl font-semibold">{mode.tagline}</h3>
              <p className="mt-2 leading-relaxed text-muted">{mode.description}</p>
              <p className="mt-4 rounded-md border border-line bg-code px-3 py-2.5 font-mono text-[13px] leading-relaxed">
                <span aria-hidden="true" className="mr-1.5 text-mode">
                  ›
                </span>
                <span className="sr-only">Example: </span>
                {mode.examplePrompt}
              </p>
              <Link
                href={mode.href}
                className="group mt-5 inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-mode underline-offset-4 hover:underline"
              >
                Open {mode.label}
                <Icon name="arrowRight" className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Principles */}
      <section
        aria-labelledby="home-principles-title"
        className="grid gap-8 border-t border-line pt-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-14"
      >
        <div>
          <p className={eyebrow}>How it teaches</p>
          <h2
            id="home-principles-title"
            className="font-display mt-3 text-3xl font-semibold text-balance sm:text-4xl"
          >
            Built for people who are just starting
          </h2>
        </div>
        <ol className="flex flex-col divide-y divide-line border-y border-line">
          {PRINCIPLES.map((p, i) => (
            <li key={p.title} className="grid grid-cols-[2.5rem_1fr] gap-x-2 py-5">
              <span aria-hidden="true" className="font-mono text-sm text-subtle tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-semibold">{p.title}</h3>
                <p className="mt-1 leading-relaxed text-muted">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Preview notice and project credit */}
      <div className="flex flex-col gap-10">
        <section
          aria-labelledby="home-preview-title"
          className="border-l-2 border-status bg-surface px-5 py-4 sm:px-6"
        >
          <h2 id="home-preview-title" className={eyebrow}>
            What&apos;s live
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed">
            Learn and Debug are connected: your question or code goes to Claude,
            Anthropic&apos;s AI model, and the answer is checked before it&apos;s shown. CodeBuddy
            never runs your code. Practice checks your answer against each exercise&apos;s
            requirements and test cases right in your browser, without running it or sending it
            anywhere. Signed-in students get a 90-day history of their answers and saved Practice
            progress. See{" "}
            <Link href="/privacy" className="font-semibold underline underline-offset-4">
              Privacy
            </Link>{" "}
            for what is stored.
          </p>
        </section>

        <p className="border-t border-line pt-6 text-sm text-muted">
          Final school project:{" "}
          <span lang="lv">„Mākslīgā intelekta programmēšanas asistents iesācējiem”</span>{" "}
          (AI programming assistant for beginners).
        </p>
      </div>
    </div>
  );
}
