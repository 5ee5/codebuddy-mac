# Setting up CodeBuddy

Notes on running CodeBuddy, locally or on a server. For what the app does and how it works, see the [README](../README.md).

## Prerequisites

- **Node.js 22 or newer.** Next.js 16 itself runs on Node 20.9+, but Node 20 has reached end-of-life and `@supabase/supabase-js` warns that it will drop Node 20 support. Use a current LTS release (Node 22 or 24).
- **npm.** The repository includes a `package-lock.json`.
- **An Anthropic API key** from the [Claude Console](https://platform.claude.com), for the AI features. Requests to Claude are billed to your Anthropic account. Without a key, the app still runs, but Learn and Debug report that the tutor isn't set up.
- **A Supabase project** from [supabase.com](https://supabase.com), for sign-in. The free plan is enough. Choose an EU region (for example Frankfurt) if your users are in the EU.

## Getting started

```bash
git clone https://github.com/5ee5/codebuddy.git
cd codebuddy
npm install
cp .env.example .env.local
```

Open `.env.local` and replace the placeholder values (see [Environment variables](#environment-variables)).

### Set up sign-in (Supabase)

Learn and Debug are only for signed-in users. Students create their own account at `/signup` with a **class code** you give them, or you create accounts yourself in Supabase.

1. In your Supabase project, open **Project Settings → API**. Copy the **Project URL** into `SUPABASE_URL` and the **publishable key** (called the `anon` key in older projects) into `SUPABASE_PUBLISHABLE_KEY`.
2. Open **Authentication → Sign In / Providers**. Turn off **Allow new users to sign up**, and leave the **Email** provider on.
3. To let students sign up themselves, copy the **secret key** (**Project Settings → API Keys**) into `SUPABASE_SECRET_KEY`, and choose a class code of at least 8 characters for `CODEBUDDY_SIGNUP_CODE`. Share the code with your class. To change it, edit `.env.local` and restart the server.
4. To create an account yourself instead, open **Authentication → Users → Add user → Create new user**. Enter the learner's email and a starting password, tick **Auto Confirm User**, and give them the password. They can change it on the **Account** page after signing in.

5. Optional, **Sign in with GitHub**. Students who connect GitHub on their Account page can then sign in with it. New students still need the class code first. To switch it on:
   1. On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**. Use your site's address as the homepage URL, and `https://<your-project-ref>.supabase.co/auth/v1/callback` as the callback URL. Create a client secret.
   2. In Supabase, open **Authentication → Sign In / Providers → GitHub**, switch it on and paste the Client ID and secret.
   3. In the same place, turn on **Allow manual linking**, so students can connect GitHub to their existing account.
   4. Open **Authentication → URL Configuration** and add `https://<your-site>/**` (and `http://localhost:3000/**` for development) to **Redirect URLs**. The `**` matters: CodeBuddy's return address includes `?next=…`, and without the wildcard Supabase rejects it and sends people to the Site URL instead. Supabase ignores entries with a plain IP address (such as `http://192.168.1.10:3000/**`), so test GitHub sign-in through `localhost` or your real domain, not a LAN address.

   The GitHub buttons appear by themselves once the provider is on (CodeBuddy checks every few minutes).

Keep public sign-up switched off in Supabase (step 2). CodeBuddy creates sign-up accounts itself with the secret key, and only when the class code is right, so the code can't be skipped by calling Supabase directly.

### Set up emails (optional)

With emails set up, new students must confirm their email address before their account works, and "Forgot your password?" sends a reset link. Without them, accounts are created already confirmed and no email is ever sent.

CodeBuddy sends these emails itself through [Resend](https://resend.com), so Supabase's own email settings and templates aren't used.

1. Create a free Resend account. Under **Domains**, add your domain and copy the DNS records it shows (DKIM and SPF on a `send.` subdomain) into your DNS provider, for example Cloudflare. Wait until Resend shows the domain as **Verified**.
2. Under **API Keys**, create a key with **Sending access**. Put it in `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to a sender on that domain, such as `CodeBuddy <noreply@your-domain>`, and `CODEBUDDY_SITE_URL` to the site's public address, such as `https://codebuddy.example`.
4. Restart the server. `SUPABASE_SECRET_KEY` must be set too: CodeBuddy uses it to create the one-time links.

Email links open `/auth/confirm`, which asks for one click before using the link. School mail systems often open links automatically to scan them, and that would otherwise use up the one-time link. Links always point to `CODEBUDDY_SITE_URL`, never to an address taken from the request, so a forged `Host` header can't redirect someone's reset link.

### Create the database tables

History, the daily allowance and Practice progress are stored in your Supabase database. The SQL is in `supabase/migrations/`. Run each file once, in order:

1. In Supabase, open **SQL Editor → New query**.
2. Paste `20261026130000_ai_requests_and_practice_progress.sql` and click **Run**.
3. Paste `20261026130100_delete_old_ai_requests.sql` and click **Run**. It schedules the nightly deletion of history older than 90 days. If it fails with a permissions error, enable **pg_cron** under **Database → Extensions** and run it again.

(With the [Supabase CLI](https://supabase.com/docs/guides/cli), `supabase link` and then `supabase db push` does the same.)

**Run the SQL before you start the app.** Learn and Debug check each student's allowance in the database, and if the tables don't exist they refuse to call Claude.

### Run it

Start the development server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). If port 3000 is in use, the terminal shows the address Next.js picked instead. Restart the dev server after you change `.env.local`.

`.env.local` is ignored by Git and must never be committed.

## Environment variables

The first four variables are **server-only and required** for Learn and Debug; the others are optional. Never prefix them with `NEXT_PUBLIC_`, because that would expose them to the browser. (The Supabase key is designed to be public, but CodeBuddy never needs it in the browser, so it stays on the server too.)

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key. It's used only on the server to call Claude. |
| `ANTHROPIC_MODEL` | Yes | The Claude model ID used by Learn and Debug. There is no built-in default. `.env.example` suggests `claude-sonnet-5-5`; see Anthropic's [models overview](https://platform.claude.com/docs/en/about-claude/models/overview) for current IDs. |
| `SUPABASE_URL` | Yes | Your Supabase project URL, for example `https://abcdefgh.supabase.co`. |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Your Supabase project's publishable (`anon`) key. Never use the secret `service_role` key here. |
| `RESEND_API_KEY` | No | Resend API key for sign-up confirmation and password-reset emails. Needs `EMAIL_FROM` and `CODEBUDDY_SITE_URL` too. |
| `EMAIL_FROM` | No | The sender of those emails, e.g. `CodeBuddy <noreply@your-domain>`; the domain must be verified in Resend. |
| `CODEBUDDY_SITE_URL` | No | The public address used in email links, e.g. `https://codebuddy.example` (no path). |
| `DEV_ORIGINS` | No | Development only: other hostnames allowed to open `npm run dev`, such as your LAN address (`192.168.1.10`), comma-separated, without `http://` or a port. |
| `CODEBUDDY_SIGNUP_CODE` | No | The class code students enter at `/signup`, at least 8 characters. Without it (or with `SUPABASE_SECRET_KEY` missing), sign-up is closed. |
| `SUPABASE_SECRET_KEY` | No | Your Supabase project's **secret** key (`sb_secret_…`, or the legacy `service_role` key). It's used only to create accounts at sign-up and to let students delete their own account. Without it, both say they aren't set up. It bypasses every access rule, so keep it in `.env.local` only. |

```bash
# .env.local (placeholders only)
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-sonnet-5-5
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SECRET_KEY=your-supabase-secret-key   # optional, for sign-up and account deletion
CODEBUDDY_SIGNUP_CODE=your-class-code           # optional, opens /signup
RESEND_API_KEY=your-resend-api-key              # optional, with the next two: emails
EMAIL_FROM=CodeBuddy <noreply@your-domain>
CODEBUDDY_SITE_URL=https://codebuddy.example
```

If any variable is missing, the pages still load. Learn and Debug then answer with a "not set up" message instead of calling Claude, and signing in says it isn't set up.

## Pages

| Route | Description |
|---|---|
| `/` | Home page: an introduction, the three modes and what's currently live |
| `/learn` | Learn mode (AI-powered) |
| `/debug` | Debug mode (AI-powered) |
| `/practice` | Practice mode (answers checked locally, not connected to the AI) |
| `/login` | Sign in with email and password |
| `/signup` | Create an account with the class code |
| `/auth/callback` | Where GitHub sign-in and "Connect GitHub" return to |
| `/account` | Shows who is signed in; connect GitHub, change password, sign out, delete the account |
| `/history` | Your saved Learn and Debug answers from the last 90 days |
| `/history/<id>` | One saved answer |
| `/privacy` | What is stored, who processes it, for how long, and how to delete it |
| `/goodbye` | Shown after an account is deleted |
| `/forgot-password` | Request a password-reset email |
| `/auth/confirm` | Where links in emails open; asks for one click before using the link |
| `/reset-password` | Choose a new password after a reset link |

`/learn`, `/debug`, `/account` and `/history` need a signed-in user. Visitors who aren't signed in are sent to `/login` and brought back afterwards. Home and Practice are open to everyone.

Unknown paths show a custom "page not found" page.

## Development and quality checks

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit` | Type-check the project (there's no separate npm script for this) |
| `npm test` | Run the Vitest test suite once |
| `npx vitest` | Run Vitest in watch mode |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build (run `npm run build` first) |
