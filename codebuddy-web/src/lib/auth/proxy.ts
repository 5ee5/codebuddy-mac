import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, SESSION_COOKIE_OPTIONS } from "@/lib/auth/config";
import { isProtectedPath, LOGIN_PATH, loginPathFor, SIGNUP_PATH } from "@/lib/auth/paths";

/*
 * Runs before every page and API request (see `src/proxy.ts`). It refreshes
 * the Supabase session so pages and routes see a valid token, and sends
 * signed-out visitors from protected pages to the sign-in page.
 *
 * This is only an optimistic check for navigation. The API routes verify the
 * user again before any paid call.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const config = getSupabaseConfig();
  // Not set up: let pages load; the API routes answer "not configured".
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        // Update the request too, so the page or route sees the refreshed session.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && isProtectedPath(pathname)) {
    return redirectKeepingCookies(request, response, loginPathFor(`${pathname}${search}`));
  }
  if (signedIn && (pathname === LOGIN_PATH || pathname === SIGNUP_PATH)) {
    return redirectKeepingCookies(request, response, "/");
  }
  return response;
}

/** A redirect that still carries any refreshed session cookies and their cache headers. */
function redirectKeepingCookies(request: NextRequest, from: NextResponse, path: string): NextResponse {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return redirect;
}
