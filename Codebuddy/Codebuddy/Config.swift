import Foundation

/// Non-secret configuration: the Supabase publishable key and the deployed
/// CodeBuddy API are both protected by RLS and server-side secrets
/// respectively, so neither needs special handling in the app binary.
enum Config {
    // TODO: fill in after Phase 0 (deploying the backend and creating a
    // Supabase project) — see SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in the
    // web app's environment.
    static let supabaseURL = URL(string: "https://YOUR_PROJECT.supabase.co")!
    static let supabasePublishableKey = "sb_publishable_REPLACE_ME"

    /// Base URL of the deployed Next.js app (e.g. a Vercel deployment).
    static let apiBaseURL = URL(string: "https://YOUR_DEPLOYMENT.vercel.app")!
}
