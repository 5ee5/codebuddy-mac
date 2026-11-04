import Auth
import Foundation

/// Wraps Supabase Auth for the app: sign-in, sign-out, and the current
/// session, published so views can react to sign-in state. Sessions persist
/// in the Keychain via `KeychainLocalStorage`, the library's own default.
@MainActor
final class SupabaseService: ObservableObject {
    static let shared = SupabaseService()

    private let client: AuthClient
    @Published private(set) var session: Session?

    private init() {
        client = AuthClient(
            url: Config.supabaseURL.appendingPathComponent("auth/v1"),
            headers: ["apikey": Config.supabasePublishableKey],
            localStorage: KeychainLocalStorage()
        )
        session = client.currentSession
        Task { [client] in
            for await (_, session) in client.authStateChanges {
                self.session = session
            }
        }
    }

    var accessToken: String? { session?.accessToken }
    var email: String? { session?.user.email }
    var userId: UUID? { session?.user.id }

    func signIn(email: String, password: String) async throws {
        try await client.signIn(email: email, password: password)
    }

    /// Opens a system browser sheet for GitHub, then exchanges the redirect
    /// back to `Config.oauthRedirectURL` for a session. GitHub is already
    /// enabled on the Supabase project; the redirect URL just needs to be
    /// allow-listed there too (Authentication → URL Configuration).
    func signInWithGitHub() async throws {
        try await client.signInWithOAuth(provider: .github, redirectTo: Config.oauthRedirectURL)
    }

    func signOut() async {
        try? await client.signOut()
    }

    func changePassword(_ newPassword: String) async throws {
        _ = try await client.update(user: UserAttributes(password: newPassword))
    }
}
