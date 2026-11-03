import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { eyebrow } from "@/components/ui/styles";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What CodeBuddy stores, who processes it, how long it is kept, and how to delete it.",
};

/*
 * Keep this page in step with the code: what's stored is defined in
 * supabase/migrations/, what's sent to Claude in src/lib/server/, and the
 * cookie options in src/lib/auth/config.ts.
 */

const CONTACT_NAME = "5ee5";
const CONTACT_EMAIL = "e5@5ee5.dev";
const LAST_UPDATED = "26 October 2026";

const link = "font-semibold text-ink underline underline-offset-4";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 text-base leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 py-4 md:py-12">
      <div>
        <p className={eyebrow}>Last updated {LAST_UPDATED}</p>
        <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">Privacy</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          What CodeBuddy keeps about you, why, for how long, and how to delete it.
        </p>
      </div>

      <Section title="Who runs CodeBuddy">
        <p>
          CodeBuddy is run by <strong>{CONTACT_NAME}</strong>. For any question about your data, or to
          ask for a copy of it, write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="What is stored">
        <p>
          <strong>Your account:</strong> your email address and your password. The password is stored
          only in scrambled (hashed) form, so nobody can read it. Kept until your account is deleted.
        </p>
        <p>
          <strong>GitHub, if you connect it:</strong> your GitHub username, name, profile picture
          link and the email address on your GitHub account, so you can sign in with GitHub.
          Disconnecting GitHub on the Account page removes them.
        </p>
        <p>
          <strong>Learn and Debug:</strong> your questions, the code and problem descriptions you send,
          CodeBuddy’s answers, and when you asked. They make up your{" "}
          <Link href="/history" className={link}>
            History
          </Link>{" "}
          and are deleted automatically after <strong>90 days</strong>. When you delete an entry
          yourself, its question and answer are removed straight away. A note that you asked a
          question at that time stays until the 90 days are up, so the limit of 20 questions a day
          keeps working.
        </p>
        <p>
          <strong>Practice:</strong> if you’re signed in, your drafts, how many hints you opened and
          which exercises you solved. Kept until your account is deleted. If you’re not signed in,
          nothing from Practice is stored: your code stays in your browser and is lost when you leave
          the page.
        </p>
        <p>
          <strong>Server logs:</strong> CodeBuddy’s server logs only short error codes, never your
          questions, code or answers.
        </p>
      </Section>

      <Section title="Who else handles your data">
        <p>
          <strong>Anthropic</strong> provides Claude, the AI that writes Learn and Debug answers. Your
          question, or your code and problem description, is sent to Anthropic to produce the answer.
          Anthropic is based in the United States, so this text leaves the EU. See{" "}
          <a href="https://www.anthropic.com/legal/privacy" className={link}>
            Anthropic’s privacy policy
          </a>
          . Practice answers are never sent to Anthropic.
        </p>
        <p>
          <strong>Supabase</strong> stores your account and the data above, in the EU (Paris,
          eu-west-3).
        </p>
        <p>
          <strong>GitHub</strong>, if you sign in with it, confirms who you are to CodeBuddy and
          knows that you used it to sign in here. See{" "}
          <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" className={link}>
            GitHub’s privacy statement
          </a>
          .
        </p>
        <p>
          <strong>Resend</strong> sends CodeBuddy’s emails: the link to confirm your email when you
          sign up, and password-reset links. It handles your email address and those emails, and is
          based in the United States. See{" "}
          <a href="https://resend.com/legal/privacy-policy" className={link}>
            Resend’s privacy policy
          </a>
          . CodeBuddy sends no other emails.
        </p>
        <p>
          <strong>Cloudflare</strong> delivers the website and secures the connection, so it sees
          technical details such as your IP address.
        </p>
        <p>
          <strong>Don’t paste passwords, personal details or anything secret</strong> into Learn or
          Debug.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          CodeBuddy sets only the cookies that keep you signed in. Scripts on the page can’t read them.
          There are no analytics, tracking or advertising cookies.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          You can see everything CodeBuddy saved from your Learn and Debug questions in your{" "}
          <Link href="/history" className={link}>
            History
          </Link>
          , and delete single entries or all of it there.
        </p>
        <p>
          You can <strong>delete your account</strong> yourself on the{" "}
          <Link href="/account" className={link}>
            Account
          </Link>{" "}
          page. That removes your account, history and Practice progress straight away.
        </p>
        <p>
          For anything else, such as a copy of your data or a correction, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
            {CONTACT_EMAIL}
          </a>
          . If you think your data is being handled wrongly, you can also complain to the data
          protection authority in your country (in Latvia, the{" "}
          <a href="https://www.dvi.gov.lv" className={link} lang="lv">
            Datu valsts inspekcija
          </a>
          ).
        </p>
      </Section>
    </div>
  );
}
