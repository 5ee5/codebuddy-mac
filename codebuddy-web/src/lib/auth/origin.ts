/**
 * This site's public address (`https://codebuddy.example`), from the request
 * headers. Behind Cloudflare and PM2 the server itself only sees
 * `localhost:3100`, so `request.url` can't be used for links people follow.
 * Supabase only redirects to addresses on its allow list, so a forged Host
 * header can't send anyone elsewhere.
 */
export function siteOriginFrom(get: (name: string) => string | null): string {
  const host = get("x-forwarded-host")?.split(",")[0]?.trim() || get("host") || "localhost:3000";
  const local = /^(localhost|127\.|10\.|192\.168\.)/.test(host);
  const proto = get("x-forwarded-proto")?.split(",")[0]?.trim() || (local ? "http" : "https");
  return `${proto}://${host}`;
}
