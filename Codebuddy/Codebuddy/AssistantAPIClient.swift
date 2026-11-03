import Foundation

/// Calls the deployed CodeBuddy API's `/api/learn` and `/api/debug` routes,
/// which hold the secret Anthropic key and usage caps. Authenticates with the
/// signed-in user's Supabase access token instead of a session cookie.
enum AssistantAPIClient {
    static func learn(_ request: LearnRequest, accessToken: String) async throws -> AssistantResult<LearnResponse> {
        try await post(request, path: "api/learn", accessToken: accessToken)
    }

    static func debug(_ request: DebugRequest, accessToken: String) async throws -> AssistantResult<DebugResponse> {
        try await post(request, path: "api/debug", accessToken: accessToken)
    }

    private static func post<Req: Encodable, Res: Decodable>(
        _ body: Req,
        path: String,
        accessToken: String
    ) async throws -> AssistantResult<Res> {
        var request = URLRequest(url: Config.apiBaseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(AssistantResult<Res>.self, from: data)
    }
}
