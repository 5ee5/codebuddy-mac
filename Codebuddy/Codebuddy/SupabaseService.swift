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

    func signIn(email: String, password: String) async throws {
        try await client.signIn(email: email, password: password)
    }

    func signOut() async {
        try? await client.signOut()
    }
}
