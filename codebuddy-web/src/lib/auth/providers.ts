import "server-only";
import { cacheLife } from "next/cache";
import { getSupabaseConfig } from "@/lib/auth/config";

/**
 * Whether GitHub sign-in is switched on in Supabase, so the buttons only
 * appear once it works. Supabase is asked at most every few minutes.
 */
export async function isGitHubEnabled(): Promise<boolean> {
  "use cache";
  cacheLife("minutes");
  const config = getSupabaseConfig();
  if (!config) return false;
  try {
    const res = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.publishableKey } });
    if (!res.ok) return false;
    const settings: { external?: Record<string, boolean> } = await res.json();
    return settings.external?.github === true;
  } catch {
    return false;
  }
}
