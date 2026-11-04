import Foundation
import PostgREST

/// Reads and writes `public.practice_progress` directly via PostgREST,
/// authenticated with the signed-in user's access token. RLS restricts every
/// row to its owner, so no explicit `user_id` filter is needed — same as the
/// web app's `lib/practice/progress.ts` persistence, minus the Next.js hop.
struct PracticeProgressRow: Decodable {
    let exerciseId: String
    var draft: String
    var hintsUsed: Int
    var solvedAt: String?

    enum CodingKeys: String, CodingKey {
        case exerciseId = "exercise_id"
        case draft
        case hintsUsed = "hints_used"
        case solvedAt = "solved_at"
    }
}

@MainActor
final class PracticeProgressStore: ObservableObject {
    @Published private(set) var progress: [String: PracticeProgressRow] = [:]

    private func client() -> PostgrestClient? {
        guard let token = SupabaseService.shared.accessToken else { return nil }
        return PostgrestClient(
            url: Config.supabaseURL.appendingPathComponent("rest/v1"),
            headers: [
                "apikey": Config.supabasePublishableKey,
                "Authorization": "Bearer \(token)",
            ]
        )
    }

    func load() async {
        guard let client = client() else { return }
        do {
            let rows: [PracticeProgressRow] = try await client
                .from("practice_progress")
                .select("exercise_id,draft,hints_used,solved_at")
                .execute()
                .value
            progress = Dictionary(uniqueKeysWithValues: rows.map { ($0.exerciseId, $0) })
        } catch {
            // Best-effort: progress just starts from the exercise's starter code.
        }
    }

    func save(exerciseId: String, draft: String, hintsUsed: Int, verdict: CheckVerdict? = nil) async {
        guard let client = client(), let userId = SupabaseService.shared.userId else { return }
        struct Upsert: Encodable {
            let user_id: String
            let exercise_id: String
            let draft: String
            let hints_used: Int
            let last_verdict: String?
        }
        let row = Upsert(user_id: userId.uuidString, exercise_id: exerciseId, draft: draft, hints_used: hintsUsed, last_verdict: verdict?.rawValue)
        do {
            try await client
                .from("practice_progress")
                .upsert(row, onConflict: "user_id,exercise_id", returning: .minimal)
                .execute()
        } catch {
            // Best-effort: the draft still lives in the view's local state.
        }
    }
}
