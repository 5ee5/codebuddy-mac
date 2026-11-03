import Foundation

/// Mirrors `src/lib/assistant/types.ts` in the web app. Field names match the
/// JSON wire format exactly, so no custom `CodingKeys` are needed.

enum LearnerLevel: String, Codable, CaseIterable, Identifiable {
    case beginner, basics, comfortable

    var id: Self { self }

    var label: String {
        switch self {
        case .beginner: "Beginner"
        case .basics: "Basics"
        case .comfortable: "Comfortable"
        }
    }
}

enum ProgrammingLanguage: String, Codable, CaseIterable, Identifiable {
    case python, javascript, java, cpp, csharp, other

    var id: Self { self }

    var label: String {
        switch self {
        case .python: "Python"
        case .javascript: "JavaScript"
        case .java: "Java"
        case .cpp: "C++"
        case .csharp: "C#"
        case .other: "Other"
        }
    }
}

struct CodeSnippet: Codable {
    let language: ProgrammingLanguage
    let code: String
}

// MARK: - Learn

struct LearnRequest: Encodable {
    let mode = "learn"
    let question: String
    let level: LearnerLevel
    /// Set when the learner started from one of the example-topic chips.
    let topic: String?
}

struct LearnResponse: Decodable {
    let explanation: String
    let example: CodeSnippet?
    let keyPoints: [String]
    let followUpQuestions: [String]
}

// MARK: - Debug

struct DebugRequest: Encodable {
    let mode = "debug"
    let language: ProgrammingLanguage
    /// The student's code, indentation intact.
    let code: String
    /// The error message, or what they expected versus what happened.
    let problem: String
}

struct DebugChange: Codable {
    let change: String
    let reason: String
}

struct DebugResponse: Decodable {
    /// `"needs_more_info"` when the code and description aren't enough to say.
    let outcome: String
    let diagnosis: String
    let explanation: String
    /// Facts that are directly visible in the code or the error.
    let confirmed: [String]
    /// Possible causes that the model could not confirm.
    let hypotheses: [String]
    /// What the student should add; never empty for `needs_more_info`.
    let missingInfo: [String]
    /// A complete corrected program. Never present for `needs_more_info`.
    let correctedCode: CodeSnippet?
    let changes: [DebugChange]
    let nextSteps: [String]
}

// MARK: - Result envelope

/// Mirrors `AssistantResult` from `src/lib/assistant/types.ts`: either a genuine
/// answer or a safe, user-facing failure whose `message` is already
/// learner-friendly and should be shown as-is.
enum AssistantResult<Response: Decodable>: Decodable {
    case answered(response: Response, model: String, createdAt: String, remainingToday: Int?, historyId: String?)
    case error(code: String, message: String)

    private enum CodingKeys: String, CodingKey {
        case status, response, model, createdAt, remainingToday, historyId, code, message
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let status = try container.decode(String.self, forKey: .status)
        if status == "answered" {
            self = .answered(
                response: try container.decode(Response.self, forKey: .response),
                model: try container.decode(String.self, forKey: .model),
                createdAt: try container.decode(String.self, forKey: .createdAt),
                remainingToday: try container.decodeIfPresent(Int.self, forKey: .remainingToday),
                historyId: try container.decodeIfPresent(String.self, forKey: .historyId)
            )
        } else {
            self = .error(
                code: try container.decode(String.self, forKey: .code),
                message: try container.decode(String.self, forKey: .message)
            )
        }
    }
}
