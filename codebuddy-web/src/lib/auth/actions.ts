"use server";

import { cookies, headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { canManageAccounts, createUserAccount, deleteUserById, verifyPassword } from "@/lib/auth/admin";
import { getSignupCode, getSupabaseConfig } from "@/lib/auth/config";
import {
  emailEnabled,
  emailRequests,
  LINK_NEXT,
  sendConfirmationEmail,
  sendPasswordResetEmail,
  type LinkType,
} from "@/lib/auth/email-links";
import { siteOriginFrom } from "@/lib/auth/origin";
import { LOGIN_PATH, loginPathFor, safeNextPath } from "@/lib/auth/paths";
import { createSupabaseClient, getSignedInUser, getSupabase } from "@/lib/auth/server";
import {
  checkSignupCode,
  newAccountLimitReached,
  recordFailedCode,
  recordNewAccount,
  tooManyFailedCodes,
} from "@/lib/auth/signup";
import {
  hasFieldErrors,
  validateAccountDeletion,
  validateNewPassword,
  validateSignIn,
  validateSignUp,
  type AuthFormState,
} from "@/lib/auth/validation";

/*
 * Sign-up with a class code, sign-in, sign-out, password changes and account
 * deletion. Supabase's own error text never reaches the page; only its error
 * code is logged.
 */

const NOT_CONFIGURED = "Sign-in isn’t set up on this server yet. Ask the person running CodeBuddy.";
const UNAVAILABLE = "Sign-in isn’t working right now. Try again in a little while.";
const DELETE_UNAVAILABLE = "Your password couldn’t be checked right now. Nothing was deleted. Try again in a little while.";

function logAuthFailure(action: string, code: string | number | undefined): void {
  console.error("[auth]", action, code ?? "-");
}

export async function signIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fieldErrors = validateSignIn(email, password);
  if (hasFieldErrors(fieldErrors)) return { fieldErrors, email };

  const config = getSupabaseConfig();
  if (!config) return { message: NOT_CONFIGURED, email };

  const supabase = await createSupabaseClient(config);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "invalid_credentials") {
      return { message: "That email and password don’t match. Check them and try again.", email };
    }
    // Supabase only says this once the password is right, so it reveals nothing to a stranger.
    if (error.code === "email_not_confirmed") {
      return {
        message: "Confirm your email first: open the link we sent you when you signed up.",
        email,
        unconfirmed: true,
      };
    }
    logAuthFailure("sign-in", error.code ?? error.status);
    if (error.status === 429) {
      return { message: "Too many sign-in attempts. Wait a few minutes, then try again.", email };
    }
    return { message: UNAVAILABLE, email };
  }
  redirect(safeNextPath(formData.get("next")));
}

/**
 * The visitor's network address, for the wrong-code limit. On the live site
 * every request comes through Cloudflare, which sets `CF-Connecting-IP`.
 */
async function clientAddress(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const SIGNUP_CLOSED = "Sign-up isn’t open on this server. Ask the person running CodeBuddy for an account.";

/**
 * Creates an account for someone with the class code, then signs them in.
 * Public sign-up stays off in Supabase; the account is created here with the
 * secret key, so the class code can't be skipped.
 */
export async function signUp(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const classCode = String(formData.get("classCode") ?? "").trim();
  const fieldErrors = validateSignUp(email, password, confirm, classCode);
  if (hasFieldErrors(fieldErrors)) return { fieldErrors, email };

  const expected = getSignupCode();
  const config = getSupabaseConfig();
  if (!expected || !config || !canManageAccounts()) return { message: SIGNUP_CLOSED, email };

  const address = await clientAddress();
  if (tooManyFailedCodes(address)) {
    return { message: "Too many wrong class codes from your network. Wait an hour, then try again.", email };
  }
  if (!checkSignupCode(classCode, expected)) {
    recordFailedCode(address);
    return { fieldErrors: { classCode: "That class code isn’t right. Check it with your teacher." }, email };
  }
  if (newAccountLimitReached()) {
    return { message: "A lot of accounts were created in the last hour. Try again later.", email };
  }

  // With email set up, the account only works once the student opens the link we send.
  const confirmByEmail = emailEnabled();
  switch (await createUserAccount(email, password, { confirmed: !confirmByEmail })) {
    case "exists":
      return { fieldErrors: { email: "There’s already an account with this email. Sign in instead." }, email };
    case "weak_password":
      return {
        fieldErrors: { password: "That password is too easy to guess. Choose a longer or less common one." },
        email,
      };
    case "unavailable":
      return { message: "Your account couldn’t be created right now. Try again in a little while.", email };
  }
  recordNewAccount();

  if (confirmByEmail) {
    const sent = await sendConfirmationEmail(email);
    return sent === "failed"
      ? {
          message: "Your account is created, but the confirmation email couldn’t be sent. Use “Send it again” below.",
          email,
          unconfirmed: true,
        }
      : {
          ok: true,
          message: `Almost done! We sent a link to ${email}. Open it to finish creating your account. It can take a minute to arrive, so check your spam folder too.`,
          email,
          unconfirmed: true,
        };
  }

  const next = safeNextPath(formData.get("next"));
  const supabase = await createSupabaseClient(config);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // The account exists; the student can sign in by hand.
    logAuthFailure("sign-in-after-sign-up", error.code ?? error.status);
    redirect(loginPathFor(next));
  }
  redirect(next);
}

const EMAIL_NOT_SET_UP = "Emails aren’t set up on this server. Ask the person running CodeBuddy.";
const TOO_MANY_EMAILS = "Too many emails were requested from your network. Wait an hour, then try again.";
const EMAIL_FAILED = "The email couldn’t be sent right now. Try again in a little while.";

/**
 * Sends a new confirmation link. The reply is the same whether or not the
 * account exists or still needs confirming, so it can't be used to find out
 * who has an account.
 */
export async function resendConfirmation(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const emailError = validateSignIn(email, "-").email;
  if (emailError) return { fieldErrors: { email: emailError }, email, unconfirmed: true };
  if (!emailEnabled()) return { message: EMAIL_NOT_SET_UP, email, unconfirmed: true };

  const address = await clientAddress();
  if (emailRequests.reached(address)) return { message: TOO_MANY_EMAILS, email, unconfirmed: true };
  emailRequests.record(address);

  if ((await sendConfirmationEmail(email)) === "failed") return { message: EMAIL_FAILED, email, unconfirmed: true };
  return {
    ok: true,
    message: `If ${email} is waiting to be confirmed, a new link is on its way. Check your spam folder too.`,
    email,
    unconfirmed: true,
  };
}

/** "Forgot password?": emails a reset link. Same reply whether or not the account exists. */
export async function requestPasswordReset(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const emailError = validateSignIn(email, "-").email;
  if (emailError) return { fieldErrors: { email: emailError }, email };
  if (!emailEnabled()) return { message: EMAIL_NOT_SET_UP, email };

  const address = await clientAddress();
  if (emailRequests.reached(address)) return { message: TOO_MANY_EMAILS, email };
  emailRequests.record(address);

  if ((await sendPasswordResetEmail(email)) === "failed") return { message: EMAIL_FAILED, email };
  return {
    ok: true,
    message: `If there’s an account for ${email}, we’ve sent it a link to choose a new password. It can take a minute to arrive, so check your spam folder too.`,
    email,
  };
}

const LINK_TYPES: readonly LinkType[] = ["email", "recovery"];

/**
 * Uses the one-time token from an email link (after the student clicked
 * "Continue" on /auth/confirm) and signs them in. A used or expired link goes
 * back to sign-in with a message.
 */
export async function confirmEmailLink(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as LinkType;
  const invalid = `${LOGIN_PATH}?error=link_invalid`;
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(tokenHash) || !LINK_TYPES.includes(type)) redirect(invalid);

  const supabase = await getSupabase();
  if (!supabase) redirect(invalid);
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    logAuthFailure(`verify-${type}`, error.code ?? error.status);
    redirect(invalid);
  }
  redirect(LINK_NEXT[type]);
}

/** This site's public address, for the link GitHub sends people back to. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  return siteOriginFrom((name) => h.get(name));
}

function callbackUrl(origin: string, next: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

/**
 * Sends the visitor to GitHub. Only GitHub accounts already connected to a
 * CodeBuddy account get in: public sign-up stays off in Supabase, so new
 * students still need the class code first.
 */
export async function signInWithGitHub(formData: FormData): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) redirect(`${LOGIN_PATH}?error=github_failed`);
  const next = safeNextPath(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: callbackUrl(await siteOrigin(), next) },
  });
  if (error || !data.url) {
    logAuthFailure("github-sign-in", error?.code ?? error?.status);
    redirect(`${LOGIN_PATH}?error=github_failed`);
  }
  redirect(data.url);
}

/** Connects the signed-in user's GitHub account, so they can sign in with it later. */
export async function connectGitHub(): Promise<void> {
  const user = await getSignedInUser();
  const supabase = user && (await getSupabase());
  if (!supabase) redirect(loginPathFor("/account"));
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "github",
    options: { redirectTo: callbackUrl(await siteOrigin(), "/account?github=connected") },
  });
  if (error || !data.url) {
    logAuthFailure("github-connect", error?.code ?? error?.status);
    redirect("/account?github=failed");
  }
  redirect(data.url);
}

/** Removes the GitHub connection; signing in with email and password still works. */
export async function disconnectGitHub(): Promise<void> {
  const user = await getSignedInUser();
  const supabase = user && (await getSupabase());
  if (!supabase) redirect(loginPathFor("/account"));
  const { data } = await supabase.auth.getUserIdentities();
  const github = data?.identities.find((identity) => identity.provider === "github");
  if (github) {
    const { error } = await supabase.auth.unlinkIdentity(github);
    if (error) {
      logAuthFailure("github-disconnect", error.code ?? error.status);
      redirect("/account?github=disconnect_failed");
    }
  }
  refresh();
}

export async function signOut(): Promise<void> {
  const config = getSupabaseConfig();
  if (config) {
    const supabase = await createSupabaseClient(config);
    // This browser only; the user stays signed in on their other devices.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) logAuthFailure("sign-out", error.code ?? error.status);
  }
  redirect("/");
}

export async function changePassword(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fieldErrors = validateNewPassword(password, confirm);
  if (hasFieldErrors(fieldErrors)) return { fieldErrors };

  const config = getSupabaseConfig();
  if (!config) return { message: NOT_CONFIGURED };

  const supabase = await createSupabaseClient(config);
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) redirect(loginPathFor("/account"));

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") {
      return { fieldErrors: { password: "That’s already your password. Choose a different one." } };
    }
    if (error.code === "weak_password") {
      return { fieldErrors: { password: "That password is too easy to guess. Choose a longer or less common one." } };
    }
    logAuthFailure("change-password", error.code ?? error.status);
    if (error.code === "reauthentication_needed") {
      return { message: "For your security, sign out, sign in again, then change your password." };
    }
    return { message: UNAVAILABLE };
  }
  return { ok: true, message: "Your password has been changed." };
}

/**
 * Deletes the signed-in user's account and, through the database, all their
 * history and Practice progress. Asks for the password again, so nobody can
 * do this from a computer someone left signed in.
 */
export async function deleteAccount(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const understood = formData.get("understood") === "on";
  const fieldErrors = validateAccountDeletion(password, understood);
  if (hasFieldErrors(fieldErrors)) return { fieldErrors };

  const user = await getSignedInUser();
  if (!user) redirect(loginPathFor("/account"));
  if (!canManageAccounts()) {
    return { message: "Deleting accounts isn’t set up on this server yet. Ask the person running CodeBuddy." };
  }
  if (!user.email) return { message: DELETE_UNAVAILABLE };

  switch (await verifyPassword(user.email, password)) {
    case "wrong":
      return { fieldErrors: { password: "That password isn’t right." } };
    case "rate_limited":
      return { message: "Too many attempts. Wait a few minutes, then try again." };
    case "unavailable":
      return { message: DELETE_UNAVAILABLE };
  }

  if (!(await deleteUserById(user.id))) {
    return { message: "Your account couldn’t be deleted right now. Nothing was removed. Try again in a little while." };
  }

  // The account is gone: drop this browser's session cookies too.
  const supabase = await createSupabaseClient(getSupabaseConfig()!);
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith("sb-")) cookieStore.delete(name);
  }
  redirect("/goodbye");
}
