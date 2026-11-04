import Foundation

/// Mirrors `lib/practice/types.ts` in the web app field-for-field.

enum CheckStatus: String, Codable {
    case pass, fail, unverified
}

struct RequirementCheck: Identifiable {
    let id: String
    let label: String
    let status: CheckStatus
    /// What CodeBuddy found, in plain words.
    var detail: String?
    /// A failed blocking check means the solution can't possibly work yet.
    var blocking: Bool = false
    /// A nudge that doesn't give away the answer.
    var hint: String?
}

struct TestCaseResult: Identifiable {
    var id: String { label }
    let label: String
    /// e.g. `greet("Ada")`.
    let call: String
    let expected: String
    /// `nil` when it can't be determined without running the code.
    var actual: String?
    /// Tri-state: `nil` means undetermined, not failed.
    var passed: Bool?
}

enum CheckVerdict: String {
    case correct, partial, incorrect, unverified
}

/// What a checker hands back to `checkAnswer`, before the verdict/summary/hint are derived.
struct CheckerOutput {
    var checks: [RequirementCheck] = []
    var tests: [TestCaseResult] = []
    var testHint: String?
}

struct PracticeCheck {
    let exerciseId: String
    let verdict: CheckVerdict
    let summary: String
    let checks: [RequirementCheck]
    let tests: [TestCaseResult]
    let hint: String?
    /// The exact code that was checked, so the UI can detect staleness.
    let checkedCode: String
    let checkedAt: Date
}

let VERDICT_LABELS: [CheckVerdict: String] = [
    .correct: "Correct",
    .partial: "Partly correct",
    .incorrect: "Not correct yet",
    .unverified: "Checks passed, run it to confirm",
]
