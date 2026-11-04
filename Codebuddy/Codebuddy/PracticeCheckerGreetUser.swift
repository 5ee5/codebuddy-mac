import Foundation

/// Mirrors `lib/practice/checkers/greet-user.ts`.

private struct GreetModel {
    let paramName: String
    let steps: [(varName: String, isPlusEquals: Bool, exprTokens: [PyToken])]
    let returnTokens: [PyToken]
}

private func buildGreetModel(_ fn: PyFunction, _ scan: ScannedSource) -> GreetModel? {
    let body = statements(fn, scan).filter { !containsPrintCall($0.text) }
    guard !body.isEmpty, let paramName = fn.params[0] else { return nil }
    let baseIndent = body[0].indent
    guard body.allSatisfy({ $0.indent == baseIndent }) else { return nil }
    guard startsWithReturnKeyword(body[body.count - 1].text) else { return nil }

    var steps: [(String, Bool, [PyToken])] = []
    for line in body.dropLast() {
        guard let tokens = lineTokens(scan, line), tokens.count >= 3, case let .name(varName) = tokens[0] else { return nil }
        let isPlusEquals: Bool
        if isOp(tokens[1], "=") { isPlusEquals = false }
        else if isOp(tokens[1], "+=") { isPlusEquals = true }
        else { return nil }
        steps.append((varName, isPlusEquals, Array(tokens[2...])))
    }

    guard let lastTokens = lineTokens(scan, body[body.count - 1]) else { return nil }
    return GreetModel(paramName: paramName, steps: steps, returnTokens: Array(lastTokens.dropFirst()))
}

private func runGreetModel(_ model: GreetModel, _ name: String) -> String? {
    var env: [String: String] = [model.paramName: name]
    for step in model.steps {
        guard let value = evalStringExpr(step.exprTokens, env) else { return nil }
        if step.isPlusEquals {
            guard let existing = env[step.varName] else { return nil }
            env[step.varName] = existing + value
        } else {
            env[step.varName] = value
        }
    }
    return evalStringExpr(model.returnTokens, env)
}

func checkGreetUser(_ code: String) -> CheckerOutput {
    let scan = scanPython(code)
    if let error = scan.error { return unreadable(error) }
    let lines = pythonLines(scan)

    let names = ["Ada", "Grace Hopper", "Sam"]
    let cases = names.map { name -> (label: String, call: String) in
        (name.contains(" ") ? "A name with a space" : "Greets \(name)", "greet(\(pythonRepr(name)))")
    }
    let expectedDisplays = names.map { pythonRepr("Hello, \($0)!") }
    let fullCases = (0..<names.count).map { (label: cases[$0].label, call: cases[$0].call, expected: expectedDisplays[$0]) }

    let (checksBase, fnOpt) = checkPythonFunction(scan, lines, name: "greet", param: "name")
    guard let fn = fnOpt else {
        return CheckerOutput(checks: checksBase, tests: testsWithoutFunction(checksBase, fullCases))
    }
    var checks = checksBase

    if let printLine = fn.body.first(where: { containsPrintCall($0.text) }) {
        checks.append(RequirementCheck(
            id: "no-print", label: "Gives the greeting back instead of printing it", status: .fail,
            detail: "Line \(printLine.line) prints inside the function.",
            hint: "greet should only return the greeting. Leave printing to the code that calls greet."
        ))
    } else {
        checks.append(RequirementCheck(id: "no-print", label: "Gives the greeting back instead of printing it", status: .pass))
    }

    if let constant = constantReturnResults(scan, lines, fn, cases, expectedDisplays: expectedDisplays) {
        return CheckerOutput(checks: checks + constant.checks, tests: constant.tests)
    }

    guard topLevelSupported(scan, lines, fn), let model = buildGreetModel(fn, scan) else {
        return CheckerOutput(checks: checks, tests: unverifiedTests(fullCases))
    }

    let results = names.map { runGreetModel(model, $0) }
    guard !results.contains(where: { $0 == nil }) else {
        return CheckerOutput(checks: checks, tests: unverifiedTests(fullCases))
    }

    var tests: [TestCaseResult] = []
    for i in 0..<names.count {
        let actual = pythonRepr(results[i]!)
        let expected = expectedDisplays[i]
        tests.append(TestCaseResult(label: cases[i].label, call: cases[i].call, expected: expected, actual: actual, passed: actual == expected))
    }

    let anyFailed = tests.contains { $0.passed == false }
    let caseMismatch = tests.contains { $0.passed == false && $0.actual?.lowercased() == $0.expected.lowercased() }
    let hint = anyFailed
        ? (caseMismatch
            ? "Check your capital letters: the greeting starts with a capital H."
            : "Compare your result with the expected text character by character. The comma, the space and the exclamation mark all count.")
        : nil

    return CheckerOutput(checks: checks, tests: tests, testHint: hint)
}
