import Foundation

/// Non-secret configuration: the Supabase publishable key and the deployed
/// CodeBuddy API are both protected by RLS and server-side secrets
/// respectively, so neither needs special handling in the app binary.
enum Config {
    // TODO: fill in after Phase 0 (deploying the backend and creating a
    // Supabase project) — see SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in the
    // web app's environment.
    static let supabaseURL = URL(string: "https://njltjlreumitorppflrw.supabase.co")!
    static let supabasePublishableKey = "sb_publishable_-MVwXWL146-UgQk0ST2cFw_LMqQwWpH"

    /// Base URL of the deployed Next.js app.
    static let apiBaseURL = URL(string: "https://codebuddy.5ee5.dev")!

    /// Where GitHub OAuth redirects back to after signing in. Matches the
    /// `CFBundleURLTypes` entry in Info.plist; must also be allow-listed in
    /// Supabase under Authentication → URL Configuration → Redirect URLs.
    static let oauthRedirectURL = URL(string: "dev.5ee5.codebuddy://login-callback")!
}
