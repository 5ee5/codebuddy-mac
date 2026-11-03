# CodeBuddy

CodeBuddy is an AI programming tutor for beginners. It helps students understand programming concepts, work out why their code doesn't behave as expected, and practise with small exercises. It explains things the way a patient teacher would: in plain language, at the learner's level, and with the reasoning behind each answer.

It started as a final school project, *„Mākslīgā intelekta programmēšanas asistents iesācējiem”* (AI programming assistant for beginners), and is built with Next.js and Anthropic's Claude models.

**Live:** [codebuddy.5ee5.dev](https://codebuddy.5ee5.dev). Home and Practice are open to everyone. Learn and Debug need an account, which students create with their class code.

## Features

CodeBuddy has three modes. **Learn and Debug are connected to Claude. Practice checks answers locally, without AI.**

### Learn: understand a concept (AI-powered)

- Ask a question about any programming idea (10–2,000 characters), or start from one of six example topics: variables, if statements, loops, functions, lists and recursion.
- Choose your level (*Beginner*, *Basics* or *Comfortable*). The explanation and vocabulary adapt to it.
- The answer contains:
  - a plain-language explanation;
  - an optional short code example, with a Copy button;
  - key points to remember;
  - follow-up questions to explore next.

### Debug: fix an error (AI-powered)

- Choose a language: Python, JavaScript, Java, C++, C# or Other.
- Paste your code (up to 10,000 characters) and describe the problem (10–4,000 characters). That can be the full error message, or what you expected to happen and what happened instead.
- "Load an example" fills in a sample bug to try.
- The answer contains:
  - a **diagnosis** of the likely problem;
  - a beginner-friendly **explanation** that refers to your code;
  - **what's certain** (facts visible in your code or error), kept separate from **possible causes that aren't confirmed**;
  - **corrected code**, when there's enough information, with a Copy button that keeps indentation and line breaks exactly;
  - **changes explained**: each change and the reason for it;
  - **next steps** for checking the fix or learning the concept.
- If the code and description aren't enough, CodeBuddy says so. It lists the missing information instead of guessing, and offers no corrected code.
- Failed requests offer **Try again**, and **Start a new debug session** clears the form after an answer.
- Your code is **never run or compiled**. CodeBuddy only reads and analyses it.

### Practice: solve an exercise (checked locally)

- Five built-in beginner exercises:

  | Exercise | Language | Difficulty | Hints |
  |---|---|---|---|
  | Say hello | Python | Easy | 2 |
  | Add up a list | Python | Easy | 3 |
  | FizzBuzz | JavaScript | Medium | 3 |
  | Count the vowels | Python | Medium | 3 |
  | Find the biggest | Python | Medium | 3 |

- Each exercise has a description, a requirements checklist, starter code, and hints you can open one at a time. A counter shows how many hints you've used.
- You write your solution in a code editor with line numbers. It's pre-filled with the starter code, and "Reset to starter code" restores it.
- **Drafts are kept separately for each exercise.** Switching exercises doesn't lose your work. If you're signed in, your drafts, the hints you've opened and the exercises you've solved are saved to your account (a moment after you stop typing) and come back on your next visit. Solved exercises get a ✓ in the list. Without an account, drafts last only while the page is open.
- **Check answer** checks your solution in the browser and shows:
  - a verdict: *Correct*, *Partly correct*, *Not correct yet*, or *Checks passed, run it to confirm*;
  - each requirement, marked as passed, not met or not checked, with what CodeBuddy found;
  - test cases with the expected result and, where it can be worked out, what your code gives (for example `total([]) → 1`, expected `0`);
  - one hint for what to fix next, without giving away the solution.
- **Your code is never run.** It isn't sent to a server or to the AI either. CodeBuddy reads the code as text (`src/lib/practice/`). For each exercise it recognises a few common ways of writing the solution, such as a running-total loop, an `if / else if` chain or an f-string. For those it works out the test results exactly. Code written another way still gets the requirement checks, but the verdict says it can't be confirmed without running it. It is never marked correct on a guess.
- **Limitation:** solutions outside the recognised shapes (for example `while` loops, recursion, `str.count`, or FizzBuzz built up as a string) can't be fully verified. Run them yourself and compare with the expected values shown.

### History and daily allowance

- Every Learn and Debug answer is saved to your **History** (`/history`) for 90 days. You can reopen an answer, delete one, or clear everything.
- Each student can ask **20 Learn or Debug questions in any 24 hours**. After an answer, CodeBuddy shows how many are left. Deleting history doesn't give questions back.

### Across the app

- A responsive layout: a sidebar on larger screens, and a bottom tab bar on phones.
- Light and dark themes that follow your system setting.
- Labelled form fields with inline validation messages, and a skip link to the main content.

## How it works

### Architecture

```
src/
├── app/                  Pages (App Router) and API route handlers
│   ├── api/learn/        POST /api/learn
│   ├── api/debug/        POST /api/debug
│   ├── learn/ debug/ practice/   Mode pages
│   ├── login/ signup/ account/   Sign-in, sign-up and account pages
│   ├── forgot-password/ reset-password/   Password reset
│   ├── auth/callback/    Where GitHub sign-in returns to
│   ├── auth/confirm/     Where links in emails open
│   ├── history/          Saved Learn and Debug answers
│   ├── privacy/ goodbye/ Privacy page; the page shown after account deletion
│   └── page.tsx, layout.tsx, not-found.tsx, globals.css
├── proxy.ts              Refreshes the sign-in session; sends signed-out visitors to /login
├── components/           UI: app shell, navigation, mode workspaces, answer views
│   ├── auth/             Sign-in, sign-up, password and account-deletion forms, the user menu
│   ├── workspace/        Learn, Debug and Practice forms (client components)
│   └── ui/               Reusable pieces: code editor, code block, copy button, fields
├── lib/
│   ├── assistant/        Shared request/response types, validation and the browser client
│   ├── auth/             Supabase sign-in: session helpers, Server Actions, sign-up, GitHub, protected paths
│   ├── db/               Database access: daily allowance, history, Practice progress, table types
│   ├── email/            Confirmation and password-reset emails, sent through Resend
│   ├── server/           Server-only code: configuration, request checks, usage cap, Claude calls, prompts
│   ├── practice/         Practice answer checker: reads code as text, never runs it
│   ├── debug-session.ts  The Debug page's request states (loading, answer, error, retry)
│   ├── modes.ts          The three modes (labels, descriptions, sections)
│   ├── exercises.ts      Practice exercises
│   └── languages.ts      Supported programming languages
└── test/                 Small helpers for the test suite
supabase/
└── migrations/           SQL for the database tables, access rules and functions
```

- **Browser:** each workspace validates input with the same rules the server uses, then sends the request to its API route. Answers are checked against the expected format again before they're shown.
- **Server:** each API route checks, in order:
  1. that the request comes from the app itself;
  2. the request type and size;
  3. that the server configuration is complete;
  4. that a user is signed in;
  5. the request fields;
  6. a shared usage cap;
  7. the student's daily allowance, in the database.

  Only then does it call Claude. The answer is then saved to the student's history. The model's reply must match a strict JSON format, and anything that doesn't match is rejected instead of shown.
- **Sign-in:** pages use Server Actions to sign in, sign out and change passwords, so the browser never talks to Supabase directly. `src/proxy.ts` refreshes the session on each request and redirects signed-out visitors away from protected pages. That's only for navigation: the API routes check the user again before any paid call.
- **Database:** tables for Learn and Debug requests (`ai_requests`) and Practice progress (`practice_progress`). Row-level security lets each student see only their own rows. Students can't write `ai_requests` directly: the functions `claim_ai_request`, `record_ai_answer` and `clear_ai_history` do, so the daily limit can't be bypassed or reset. CodeBuddy talks to the database as the signed-in student, never with an admin key.
- **Server-only boundary:** the Anthropic and Supabase settings are read only in `src/lib/server/` and `src/lib/auth/`, whose modules are marked `server-only`. They never reach the browser bundle.

### API endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/learn` | Answers a Learn question |
| `POST /api/debug` | Diagnoses a Debug submission |

Both endpoints:
- accept JSON only;
- accept requests from the app's own pages only, not from other websites;
- require a signed-in user. The session is a cookie that the browser sends automatically, and the server verifies it with Supabase.

Responses are JSON, either an answer or an error with a short, user-friendly message. If something fails, the error message never includes provider details, stack traces or secrets. There is no API endpoint for Practice.

### Security and limitations

- **AI answers can be wrong.** Treat explanations and corrected code as suggestions. Read them, run the code yourself, and check the result.
- **Code is never executed.** CodeBuddy sends Debug code to Claude for analysis only, and Practice answers are checked by reading them in the browser. Nothing is run or compiled, and the app says so in Debug answers and Practice results.
- **Submitted text goes to Anthropic.** Learn questions and Debug code and descriptions are sent to the Anthropic API for processing. Don't paste secrets or private data into the forms.
- **API key:** it's kept on the server and is never sent to the browser, logged or returned in responses.
- **Accounts:** sign-in uses Supabase Auth with email and password. Accounts come from sign-up with the class code, or are created by the teacher in Supabase.
  - Public sign-up is off in Supabase. CodeBuddy creates sign-up accounts itself with the secret key, and only when the class code is right, so the code can't be skipped by calling Supabase directly.
  - Sign-up allows about 10 wrong class codes per network address per hour, and 60 new accounts per hour in total. Both limits are kept in memory and reset when the server restarts.
  - With emails set up, new accounts only work once the email address is confirmed. Without them, addresses aren't verified: a student who mistypes theirs can still sign in with it, but nothing is ever sent to it.
  - Email links always point to the configured site address, never to one taken from the request, so a forged `Host` header can't redirect someone's reset link. They open `/auth/confirm`, which asks for one click before using the link, because school mail systems often open links automatically to scan them.
  - "Forgot your password?" and "Send it again" give the same reply whether or not the account exists, and allow 20 requests per network address per hour.
  - GitHub sign-in only works for GitHub accounts already connected to a CodeBuddy account (or with the same email). Because public sign-up is off, Supabase refuses to create new accounts through GitHub, so the class code can't be skipped that way.
  - The session cookie is `httpOnly` and `SameSite=Lax`, so page scripts can't read it and other websites can't use it to send requests. The API routes also reject requests from other origins.
  - Over plain HTTP, for example on a local network, passwords and session cookies can be read from network traffic. Serve the app over HTTPS.
- **Usage cap:** each student can ask 20 questions in any 24 hours (enforced in the database). On top of that, the server allows a limited number of AI requests per hour and at the same time, shared by all users.
  - The cap is kept in memory, so it resets when the server restarts and isn't shared between multiple server instances.
  - Requests are never retried automatically, to avoid unexpected charges.
- **Stored data:** Learn questions, Debug code and descriptions, and the answers are stored in Supabase for 90 days. Practice drafts and progress are kept until the account is deleted. The `/privacy` page explains this to students.
- **Account deletion:** students can delete their own account on the Account page after entering their password again. It removes the account, history and Practice progress at once. The Supabase secret key is used only in `src/lib/auth/admin.ts`, for this and for sign-up.
- **Built for a single class.** It's designed to run as one server instance (the in-memory limits above assume that), and it hasn't had an independent security review.

### Tests

The tests run in Node and replace the Anthropic client with a mock. **They don't need an API key and never spend credits.** They cover:
- request and response validation;
- the API routes' security checks and error handling;
- the browser client;
- the daily allowance and history in the API routes (with the database faked);
- sign-in, sign-up with the class code, and its rate limits;
- GitHub sign-in and connecting GitHub, including the `/auth/callback` route;
- confirmation and password-reset emails, and the links in them (with Resend faked);
- account deletion and safe redirects after sign-in;
- Practice progress checks, and that the database's exercise list and limit match the code;
- code formatting and copying;
- the answer views and the Debug session state.

## Technology stack

| Area | Technology (version from `package.json`) |
|---|---|
| Framework | [Next.js](https://nextjs.org) `16.4.3` (App Router, Turbopack) |
| UI | [React](https://react.dev) `19.3.0` |
| Language | [TypeScript](https://www.typescriptlang.org) `^5` (strict mode) |
| Styling | [Tailwind CSS](https://tailwindcss.com) `^4` via `@tailwindcss/turbopack` |
| AI | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) `1.3.0` (Claude Messages API with structured JSON output) |
| Sign-in and database | [Supabase](https://supabase.com) (Auth and Postgres with row-level security) via `@supabase/supabase-js` `2.118.0` and `@supabase/ssr` `0.12.7` |
| Email | [Resend](https://resend.com) HTTP API, called with `fetch` |
| Tests | [Vitest](https://vitest.dev) `4.1.12` |
| Linting | ESLint `^9` with `eslint-config-next` `16.4.3` |
| Fonts | Geist, Geist Mono and Fraunces through `next/font` |

## Roadmap

Possible improvements, planned or under consideration (not implemented yet):

- Full verification for every Practice solution. This would need a real sandbox, such as Pyodide or a JavaScript interpreter in an isolated worker or iframe with time limits and no network access, or an isolated server-side runner.
- AI feedback for Practice solutions. The response format is already defined in the code, but nothing produces it yet.
- A "download my data" button (for now, students ask by email, as the privacy page says).
- A teacher view of students' progress.
- Streaming AI answers, so long Debug answers appear progressively instead of after a wait.
