import "server-only";
import type { CookieOptionsWithName } from "@supabase/ssr";

/*
 * Supabase settings. Both are read on the server only: CodeBuddy signs users
 * in through Server Actions and never talks to Supabase from the browser, so
 * neither needs a `NEXT_PUBLIC_` prefix.
 */
export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

/** Returns `null` when anything is missing, so sign-in fails closed. */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

/**
 * The secret key, used only to delete accounts (`src/lib/auth/admin.ts`). It
 * bypasses every access rule, so it must never be sent anywhere else. `null`
 * when it isn't set, or when the publishable key was pasted by mistake.
 */
export function getSupabaseSecretKey(): string | null {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key || key.startsWith("sb_publishable_")) return null;
  return key;
}

/** Shorter codes are treated as "sign-up closed", so a guessable code never works. */
export const SIGNUP_CODE_MIN_LENGTH = 8;

/**
 * The class code students need to create an account, or `null` when sign-up
 * is closed (not set, or too short).
 */
export function getSignupCode(): string | null {
  const code = process.env.CODEBUDDY_SIGNUP_CODE?.trim();
  if (!code || code.length < SIGNUP_CODE_MIN_LENGTH) return null;
  return code;
}

/**
 * No browser code reads the session, so the cookies can be `httpOnly`: a
 * script injected into the page can't steal them. Supabase's other defaults
 * (`SameSite=Lax`, path `/`) stay.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = { httpOnly: true };
