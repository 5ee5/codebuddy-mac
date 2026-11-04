import Foundation

/// Mirrors `lib/practice/check.ts`: turns a checker's raw output into the
/// verdict/summary/hint the UI shows.

private let CHECKERS: [String: (String) -> CheckerOutput] = [
    "greet-user": checkGreetUser,
    "sum-list": checkSumList,
    "fizzbuzz": checkFizzBuzz,
    "count-vowels": checkCountVowels,
    "largest-number": checkLargestNumber,
]

/// Practice solutions are capped at this many characters, same as the web app.
let PRACTICE_SOLUTION_MAX = 10000

private func verdictFor(_ output: CheckerOutput) -> CheckVerdict {
    if output.checks.contains(where: { $0.blocking && $0.status == .fail }) { return .incorrect }
    if output.checks.contains(where: { $0.status == .fail }) || output.tests.contains(where: { $0.passed == false }) { return .partial }
    if output.tests.isEmpty || output.checks.contains(where: { $0.status == .unverified }) || output.tests.contains(where: { $0.passed == nil }) {
        return .unverified
    }
    return .correct
}

private func summaryFor(_ verdict: CheckVerdict, _ output: CheckerOutput) -> String {
    switch verdict {
    case .correct:
        return "Your solution meets every requirement and passes all \(output.tests.count) test cases."
    case .partial:
        let failed = output.checks.filter { $0.status == .fail }.count + output.tests.filter { $0.passed == false }.count
        return failed == 1 ? "Good progress, but 1 thing still needs fixing." : "Good progress, but \(failed) things still need fixing."
    case .incorrect:
        if output.checks.contains(where: { $0.id == "readable" && $0.status == .fail }) {
            return "CodeBuddy couldn't read your code, so it couldn't check it."
        }
        return "Not there yet. Fix the first unmet requirement below, then check again."
    case .unverified:
        return "Nothing failed, but your code is written in a way CodeBuddy can't work through without running it, so it can't confirm the results. Run it yourself and compare with the expected values below."
    }
}

private func hintFor(_ verdict: CheckVerdict, _ output: CheckerOutput) -> String? {
    if verdict == .correct { return nil }
    if let failedCheck = output.checks.first(where: { $0.status == .fail && $0.hint != nil }) {
        return failedCheck.hint
    }
    if output.tests.contains(where: { $0.passed == false }), let testHint = output.testHint {
        return testHint
    }
    if verdict == .unverified {
        return "Run your code and compare each result with the expected value."
    }
    return nil
}

func checkAnswer(_ exercise: Exercise, _ code: String, now: Date = Date()) -> PracticeCheck {
    let output: CheckerOutput
    if code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        output = CheckerOutput(checks: [RequirementCheck(
            id: "not-empty", label: "Has some code", status: .fail, detail: "The editor is empty.", blocking: true,
            hint: "Start from the starter code and fill in the function."
        )], tests: [])
    } else if code.count > PRACTICE_SOLUTION_MAX {
        output = CheckerOutput(checks: [RequirementCheck(
            id: "length", label: "Is under \(PRACTICE_SOLUTION_MAX) characters", status: .fail,
            detail: "Your code is \(code.count) characters long.", blocking: true,
            hint: "These exercises need only a few lines. Remove anything you don't need."
        )], tests: [])
    } else if let checker = CHECKERS[exercise.id] {
        output = checker(code)
    } else {
        output = CheckerOutput(checks: [RequirementCheck(
            id: "supported", label: "Can be checked automatically", status: .unverified,
            detail: "CodeBuddy has no checks for this exercise yet."
        )], tests: [])
    }

    let verdict = verdictFor(output)
    return PracticeCheck(
        exerciseId: exercise.id,
        verdict: verdict,
        summary: summaryFor(verdict, output),
        checks: output.checks,
        tests: output.tests,
        hint: hintFor(verdict, output),
        checkedCode: code,
        checkedAt: now
    )
}

/// Mirrors `validatePractice`: whether a solution is worth checking yet.
func validatePracticeSubmission(_ solution: String, starterCode: String) -> String? {
    let trimmed = solution.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return "Write some code before checking it." }
    if trimmed == starterCode.trimmingCharacters(in: .whitespacesAndNewlines) {
        return "This still looks like the starter code. Make a change before checking it."
    }
    if solution.count > PRACTICE_SOLUTION_MAX { return "Your code is too long to check." }
    return nil
}
