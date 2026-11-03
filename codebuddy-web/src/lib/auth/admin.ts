import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig, getSupabaseSecretKey } from "@/lib/auth/config";

/*
 * The only code that uses Supabase's secret key: creating an account with a
 * class code, making one-time email links, and deleting an account. Each call gets a fresh client that
 * never stores a session or sets cookies.
 */

const STATELESS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export type PasswordCheck = "ok" | "wrong" | "rate_limited" | "unavailable";

/**
 * Checks a password without touching the browser's session: it signs in on a
 * throwaway client, then ends that extra session straight away.
 */
export async function verifyPassword(email: string, password: string): Promise<PasswordCheck> {
  const config = getSupabaseConfig();
  if (!config) return "unavailable";
  const client = createClient(config.url, config.publishableKey, STATELESS);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "invalid_credentials") return "wrong";
    if (error.status === 429) return "rate_limited";
    console.error("[auth]", "verify-password", error.code ?? error.status ?? "-");
    return "unavailable";
  }
  await client.auth.signOut({ scope: "local" });
  return "ok";
}

function adminClient() {
  const config = getSupabaseConfig();
  const secretKey = getSupabaseSecretKey();
  return config && secretKey ? createClient(config.url, secretKey, STATELESS) : null;
}

/** Whether this server can create and delete accounts at all. */
export function canManageAccounts(): boolean {
  return Boolean(getSupabaseConfig() && getSupabaseSecretKey());
}

export type CreateUserResult = "ok" | "exists" | "weak_password" | "unavailable";

/**
 * Creates an account. It works while public sign-up is switched off in
 * Supabase, which keeps the class code the only way in. When `confirmed` is
 * false, the student can't sign in until they open the confirmation link.
 */
export async function createUserAccount(
  email: string,
  password: string,
  { confirmed }: { confirmed: boolean },
): Promise<CreateUserResult> {
  const admin = adminClient();
  if (!admin) return "unavailable";
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: confirmed });
  if (!error) return "ok";
  if (error.code === "email_exists" || error.code === "user_already_exists") return "exists";
  if (error.code === "weak_password") return "weak_password";
  console.error("[auth]", "create-user", error.code ?? error.status ?? "-");
  return "unavailable";
}

export type EmailTokenResult = { token: string } | "not_found" | "already_confirmed" | "unavailable";

/**
 * A one-time token for a confirmation (`signup`) or password-reset
 * (`recovery`) link. Nothing is sent: CodeBuddy emails the link itself. An
 * unknown email never creates an account here.
 */
export async function generateEmailToken(type: "signup" | "recovery", email: string): Promise<EmailTokenResult> {
  const admin = adminClient();
  if (!admin) return "unavailable";
  const { data, error } = await admin.auth.admin.generateLink({ type, email } as Parameters<
    typeof admin.auth.admin.generateLink
  >[0]);
  if (!error && data.properties?.hashed_token) return { token: data.properties.hashed_token };
  if (error?.code === "user_not_found") return "not_found";
  if (error?.code === "email_exists") return "already_confirmed";
  console.error("[auth]", `generate-${type}-link`, error?.code ?? error?.status ?? "-");
  return "unavailable";
}

/**
 * Deletes the user from Supabase Auth. The database removes their history
 * and Practice progress with it (`on delete cascade`).
 */
export async function deleteUserById(userId: string): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[auth]", "delete-user", error.code ?? error.status ?? "-");
    return false;
  }
  return true;
}
