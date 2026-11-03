import { NextResponse, type NextRequest } from "next/server";
import { siteOriginFrom } from "@/lib/auth/origin";
import { LOGIN_PATH, safeNextPath } from "@/lib/auth/paths";
import { getSupabase } from "@/lib/auth/server";

/*
 * GET /auth/callback: where Supabase sends people back after GitHub, both
 * for signing in and for connecting GitHub on the Account page. It swaps the
 * one-time code for a session cookie, then continues to `next` (same-site
 * paths only). Supabase's error text is never shown; only its code is logged.
 */

/** Short reasons the login and account pages turn into messages. */
function failureReason(errorCode: string | null): string {
  if (errorCode === "signup_disabled") return "github_not_connected";
  if (errorCode === "identity_already_exists") return "taken";
  return "failed";
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  // `request.url` is the server's own address behind Cloudflare; redirect to the public one.
  const origin = siteOriginFrom((name) => request.headers.get(name));
  const next = safeNextPath(params.get("next"));
  // Connecting GitHub starts and ends on the Account page; signing in on the login page.
  const connecting = next === "/account" || next.startsWith("/account?");

  const fail = (errorCode: string | null) => {
    console.error("[auth]", "github-callback", errorCode ?? "-");
    const reason = failureReason(errorCode);
    const target = connecting
      ? `/account?github=${reason}`
      : `${LOGIN_PATH}?error=${reason === "github_not_connected" ? reason : "github_failed"}`;
    return NextResponse.redirect(new URL(target, origin));
  };

  const providerError = params.get("error_code") ?? params.get("error");
  if (providerError) return fail(providerError);

  const code = params.get("code");
  const supabase = await getSupabase();
  if (!code || !supabase) return fail(code ? "not_configured" : "missing_code");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.code ?? String(error.status ?? ""));
  return NextResponse.redirect(new URL(next, origin));
}
