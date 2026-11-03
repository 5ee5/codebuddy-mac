/*
 * Which pages need a signed-in user, and where to send people after they
 * sign in. Pure functions, shared by the proxy, the sign-in action and tests.
 */

/**
 * Learn and Debug call the paid AI; Account and History hold the user's own
 * data; Reset password needs the session from a reset link. Practice stays open.
 */
export const PROTECTED_PATHS = ["/learn", "/debug", "/account", "/history", "/reset-password"] as const;

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * The page to open after signing in. Only same-site paths are allowed, so a
 * crafted `?next=` link can't send someone to another website.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return value;
}

/** `/login`, remembering the page to come back to. */
export function loginPathFor(next: string): string {
  const target = safeNextPath(next);
  return target === "/" ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(target)}`;
}
