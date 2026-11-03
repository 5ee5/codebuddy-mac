import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { getSupabaseConfig, SESSION_COOKIE_OPTIONS, type SupabaseConfig } from "@/lib/auth/config";
import type { Database } from "@/lib/db/types";

/*
 * Supabase access for Server Components, Server Actions and Route Handlers.
 * A new client is created for every request, as `@supabase/ssr` requires.
 */

export type CodeBuddyClient = SupabaseClient<Database>;

export async function createSupabaseClient(config: SupabaseConfig): Promise<CodeBuddyClient> {
  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * A client that acts as the signed-in user, so the database's row-level
 * security applies. `null` when Supabase isn't configured.
 */
export async function getSupabase(): Promise<CodeBuddyClient | null> {
  // The client reads the clock to check the session, so this must run at
  // request time, never while a page is being prerendered.
  await connection();
  const config = getSupabaseConfig();
  return config ? createSupabaseClient(config) : null;
}

export interface SignedInUser {
  id: string;
  email: string | null;
}

/**
 * The user behind this request, or `null`. `getClaims()` verifies the
 * session token instead of trusting the cookie, so this is safe to use for
 * access decisions. Cached per request, so the shell and a page can both ask.
 */
export const getSignedInUser = cache(async (): Promise<SignedInUser | null> => {
  // Always decide at request time, even when Supabase isn't configured at build time.
  await connection();
  const config = getSupabaseConfig();
  if (!config) return null;
  const supabase = await createSupabaseClient(config);
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
});

export interface RequestContext {
  user: SignedInUser;
  supabase: CodeBuddyClient;
}

const BEARER_PREFIX = "Bearer ";

/** A native client's access token, sent instead of a session cookie. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token || null;
}

/**
 * A client authenticated with a native client's own access token, instead of
 * the browser's session cookie. Stateless: it never persists or refreshes a
 * session, since the native client owns that lifecycle.
 */
function createBearerClient(config: SupabaseConfig, token: string): CodeBuddyClient {
  return createClient<Database>(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * The signed-in user and a Supabase client acting as them, from either a
 * bearer token (native clients) or the session cookie (the browser). `null`
 * when Supabase isn't configured or nobody is signed in. Every downstream
 * call should reuse the returned `supabase` client, so row-level security
 * and `auth.uid()` resolve against whichever session actually made the
 * request.
 */
export async function getRequestContext(request: Request): Promise<RequestContext | null> {
  await connection();
  const config = getSupabaseConfig();
  if (!config) return null;

  const token = bearerToken(request);
  const supabase = token ? createBearerClient(config, token) : await createSupabaseClient(config);
  // `getClaims()` verifies whichever session the client already holds (the
  // cookie flow). The bearer client holds no session of its own — the token
  // only lives in its request headers for PostgREST/RPC calls — so its token
  // must be passed in explicitly to be verified.
  const { data, error } = await supabase.auth.getClaims(token ?? undefined);
  if (error || !data?.claims.sub) return null;
  return { user: { id: data.claims.sub, email: data.claims.email ?? null }, supabase };
}
