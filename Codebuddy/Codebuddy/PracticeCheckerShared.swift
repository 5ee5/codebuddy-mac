import Foundation

/// Mirrors the shared scaffolding in `lib/practice/checkers/shared.ts`, used by
/// all four Python checkers (greet-user, sum-list, count-vowels, largest-number).

func compact(_ s: String) -> String {
    String(s.filter { !$0.isWhitespace })
}

func unreadable(_ error: SourceError) -> CheckerOutput {
    CheckerOutput(checks: [
        RequirementCheck(
            id: "readable", label: "The code can be read", status: .fail, detail: error.message, blocking: true,
            hint: "Look closely at line \(error.line): every quote and bracket needs a partner that closes it."
        )
    ], tests: [])
}

func unverifiedTests(_ cases: [(label: String, call: String, expected: String)]) -> [TestCaseResult] {
    cases.map { TestCaseResult(label: $0.label, call: $0.call, expected: $0.expected, actual: nil, passed: nil) }
}

func testsWithoutFunction(_ checks: [RequirementCheck], _ cases: [(label: String, call: String, expected: String)]) -> [TestCaseResult] {
    let blockingFailed = checks.contains { $0.blocking && $0.status == .fail }
    return blockingFailed ? [] : unverifiedTests(cases)
}

func formatNumberDisplay(_ value: Double, isFloat: Bool) -> String {
    if value.isInfinite { return value > 0 ? "inf" : "-inf" }
    if value.rounded() == value {
        return isFloat ? "\(Int(value)).0" : String(Int(value))
    }
    return String(value)
}

private func startsWithKeyword(_ text: String, _ keyword: String) -> Bool {
    guard text.hasPrefix(keyword) else { return false }
    let after = text.index(text.startIndex, offsetBy: keyword.count)
    guard after < text.endIndex else { return true }
    let next = text[after]
    return !(next.isLetter || next.isNumber || next == "_")
}

func startsWithReturnKeyword(_ text: String) -> Bool { startsWithKeyword(text, "return") }

func returnHasValue(_ text: String) -> Bool {
    guard startsWithReturnKeyword(text) else { return false }
    let after = text.index(text.startIndex, offsetBy: 6)
    let rest = text[after...].drop { $0 == " " || $0 == "\t" }
    return !rest.isEmpty
}

func containsPrintCall(_ text: String) -> Bool {
    text.range(of: #"(^|[^\w.])print\s*\("#, options: .regularExpression) != nil
}

/// Line number of the first match of `pattern` in the whole file's masked source, if any.
func firstMatchLine(_ pattern: String, in scan: ScannedSource) -> Int? {
    let text = scan.maskedString
    guard let range = text.range(of: pattern, options: .regularExpression) else { return nil }
    let offset = text.distance(from: text.startIndex, to: range.lowerBound)
    return lineAt(scan.code, offset)
}

// MARK: - checkPythonFunction

func checkPythonFunction(_ scan: ScannedSource, _ lines: [PyLine], name: String, param: String) -> (checks: [RequirementCheck], fn: PyFunction?) {
    var checks: [RequirementCheck] = []
    let allFuncs = pythonFunctions(lines)
    let matching = allFuncs.filter { $0.name == name }
    let definesLabel = "Defines \(name)(\(param)) with one parameter"

    if matching.isEmpty {
        let isLambda = lines.contains { $0.indent == 0 && compact($0.text).hasPrefix("\(name)=lambda") }
        if isLambda {
            checks.append(RequirementCheck(
                id: "defines", label: definesLabel, status: .unverified,
                detail: "\(name) is written as a lambda. CodeBuddy can only check functions written with def."
            ))
            return (checks, nil)
        }
        let detail: String
        let hint: String
        if let other = allFuncs.first {
            detail = "CodeBuddy found def \(other.name)(\u{2026}), but no function called \(name)."
            hint = "Check the name after def: it must be exactly \(name). Python is case-sensitive."
        } else {
            detail = "CodeBuddy couldn't find def \(name)(\u{2026}) at the start of a line."
            hint = "Start with def \(name)(\(param)): on its own line, not indented, and indent the function's code below it."
        }
        checks.append(RequirementCheck(id: "defines", label: definesLabel, status: .fail, detail: detail, blocking: true, hint: hint))
        return (checks, nil)
    }

    let fn = matching[matching.count - 1]
    let paramCount = fn.params.count
    let oneValid = paramCount == 1 && fn.params[0] != nil
    if oneValid {
        checks.append(RequirementCheck(id: "defines", label: definesLabel, status: .pass))
    } else {
        let detail = paramCount == 1
            ? "\(name) takes an unusual parameter (line \(fn.def.line))."
            : "\(name) takes \(paramCount) parameters (line \(fn.def.line))."
        checks.append(RequirementCheck(
            id: "defines", label: definesLabel, status: .fail, detail: detail, blocking: true,
            hint: "The parentheses after \(name) list its inputs. This exercise passes in one value, so put one plain name there, such as \(param)."
        ))
    }

    if matching.count > 1 {
        checks.append(RequirementCheck(
            id: "defined-once", label: "\(name) is defined only once", status: .fail,
            detail: "\(name) is defined \(matching.count) times. Python only keeps the last one.",
            hint: "Delete the extra copies of \(name) so that only one is left."
        ))
    }

    let nonPlaceholder = fn.body.filter { !isPlaceholder($0, scan) }
    let hasCode = !nonPlaceholder.isEmpty
    if hasCode {
        checks.append(RequirementCheck(id: "has-code", label: "Has its own code in the function body", status: .pass))
    } else {
        let detail = fn.body.isEmpty
            ? "CodeBuddy couldn't find an indented body under def \(name)(\u{2026}). The function's code must be indented."
            : "The function body still only contains pass."
        checks.append(RequirementCheck(
            id: "has-code", label: "Has its own code in the function body", status: .fail, detail: detail, blocking: true,
            hint: "Replace pass with the steps your function needs. The hints above can help you start."
        ))
    }

    let hasReturnWithValue = hasCode && nonPlaceholder.contains { returnHasValue($0.text) }
    if hasReturnWithValue {
        checks.append(RequirementCheck(id: "returns", label: "Returns a value", status: .pass))
    } else {
        let prints = nonPlaceholder.contains { containsPrintCall($0.text) }
        let hasBareReturn = nonPlaceholder.contains { startsWithReturnKeyword($0.text) }
        let detail: String
        let hint: String
        if prints {
            detail = "The function prints its result but doesn't return it."
            hint = "print only shows text on the screen. return hands the value back to the code that called the function."
        } else if hasBareReturn {
            detail = "return on its own gives back None, not a value."
            hint = "Finish the function with return followed by the value it should give back."
        } else {
            detail = "There is no return statement, so the function gives back None."
            hint = "Finish the function with return followed by the value it should give back."
        }
        checks.append(RequirementCheck(id: "returns", label: "Returns a value", status: .fail, detail: detail, blocking: true, hint: hint))
    }

    let blockingFailed = checks.contains { $0.blocking && $0.status == .fail }
    return (checks, blockingFailed ? nil : fn)
}

/// The function's body with placeholder lines removed, or `[]` if indentation
/// mixes tabs and spaces (too risky to pattern-match).
func statements(_ fn: PyFunction, _ scan: ScannedSource) -> [PyLine] {
    let hasTab = fn.body.contains { $0.tab }
    let hasSpace = fn.body.contains { !$0.tab }
    if hasTab && hasSpace { return [] }
    return fn.body.filter { !isPlaceholder($0, scan) }
}

func isLoopLine(_ text: String) -> Bool {
    text.range(of: #"^(for|while)\b.*:$"#, options: .regularExpression) != nil
}

/// The first `return` found directly inside a `for`/`while` block, if any.
func returnInsideLoop(_ body: [PyLine]) -> PyLine? {
    var i = 0
    while i < body.count {
        let line = body[i]
        if isLoopLine(line.text) {
            var j = i + 1
            if j < body.count, body[j].indent > line.indent {
                let blockIndent = body[j].indent
                while j < body.count, body[j].indent > line.indent {
                    if body[j].indent == blockIndent, startsWithReturnKeyword(body[j].text) {
                        return body[j]
                    }
                    j += 1
                }
                i = j
                continue
            }
        }
        i += 1
    }
    return nil
}

/// Parses `for X in <iterable>:`, returning the loop variable and the raw iterable text.
func parseForHeader(_ text: String) -> (loopVar: String, iterable: String)? {
    guard let regex = try? NSRegularExpression(pattern: #"^for\s+(\w+)\s+in\s+(.+):$"#) else { return nil }
    let ns = text as NSString
    guard let m = regex.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else { return nil }
    return (ns.substring(with: m.range(at: 1)), ns.substring(with: m.range(at: 2)))
}

/// True when `name` is bound exactly once at the top level (its own `def`, usually).
func boundOnce(_ lines: [PyLine], _ name: String) -> Bool {
    let escaped = NSRegularExpression.escapedPattern(for: name)
    let pattern = "^(\(escaped)\\s*=(?!=)|(def|class)\\s+\(escaped)\\b)"
    let count = lines.filter { $0.indent == 0 && $0.text.range(of: pattern, options: .regularExpression) != nil }.count
    return count == 1
}

private func isSimpleTopLevel(_ line: PyLine, _ scan: ScannedSource) -> Bool {
    if line.text.range(of: #"^print\s*\(.*\)$"#, options: .regularExpression) != nil { return true }
    guard let tokens = lineTokens(scan, line), tokens.count >= 3 else { return false }
    guard case .name = tokens[0], isOp(tokens[1], "=") else { return false }
    for t in tokens[2...] {
        switch t {
        case let .str(prefix, _):
            if prefix.contains("f") { return false }
        case .num:
            continue
        case let .op(v):
            if !["[", "]", "(", ")", ",", "-"].contains(v) { return false }
        case .name:
            return false
        }
    }
    return true
}

/// True when every line in the file is either part of `fn` or a "simple"
/// top-level line (a `print(...)` or a plain literal assignment).
func topLevelSupported(_ scan: ScannedSource, _ lines: [PyLine], _ fn: PyFunction) -> Bool {
    let funcStarts = Set([fn.def.start] + fn.body.map(\.start))
    for line in lines where !funcStarts.contains(line.start) {
        guard line.indent == 0, isSimpleTopLevel(line, scan) else { return false }
    }
    return true
}

// MARK: - constantReturnResults

private enum ConstantReturnValue {
    case none
    case number(Double, isFloat: Bool)
    case string(String)
}

private func singleStatementBody(_ fn: PyFunction, _ scan: ScannedSource) -> PyLine? {
    let nonPlaceholder = fn.body.filter { !isPlaceholder($0, scan) }
    return nonPlaceholder.count == 1 ? nonPlaceholder[0] : nil
}

private func parseConstant(_ line: PyLine, _ scan: ScannedSource) -> ConstantReturnValue? {
    guard let tokens = lineTokens(scan, line), isName(tokens.first, "return") else { return nil }
    let rest = Array(tokens.dropFirst())
    guard !rest.isEmpty else { return nil }

    if rest.count == 1, case let .name(n) = rest[0], n == "None" { return .none }
    if rest.count == 1, case let .str(prefix, value) = rest[0], !prefix.contains("f"), !prefix.contains("b") {
        return .string(value)
    }
    if rest.count == 1, case let .num(v, isFloat) = rest[0] { return .number(v, isFloat: isFloat) }
    if rest.count == 2, isOp(rest[0], "-"), case let .num(v, isFloat) = rest[1] { return .number(-v, isFloat: isFloat) }
    return nil
}

/// Detects a function body that's exactly `return <literal>` and so always
/// gives back the same value, whatever it's given. `expectedDisplays` are the
/// already-formatted expected values (e.g. `"27"`, `"\"Hello, Ada!\""`),
/// matching `cases` 1:1. Returns `nil` when the body isn't this shape.
func constantReturnResults(
    _ scan: ScannedSource,
    _ lines: [PyLine],
    _ fn: PyFunction,
    _ cases: [(label: String, call: String)],
    expectedDisplays: [String]
) -> CheckerOutput? {
    guard topLevelSupported(scan, lines, fn),
          let line = singleStatementBody(fn, scan),
          let constant = parseConstant(line, scan)
    else { return nil }

    let display: String
    switch constant {
    case .none: display = "None"
    case let .number(v, isFloat): display = formatNumberDisplay(v, isFloat: isFloat)
    case let .string(s): display = pythonRepr(s)
    }

    var tests: [TestCaseResult] = []
    var allPass = true
    for (i, c) in cases.enumerated() {
        let expected = expectedDisplays[i]
        let passed = display == expected
        if !passed { allPass = false }
        tests.append(TestCaseResult(label: c.label, call: c.call, expected: expected, actual: display, passed: passed))
    }

    if allPass { return CheckerOutput(checks: [], tests: tests) }

    return CheckerOutput(checks: [RequirementCheck(
        id: "uses-input", label: "Uses its input to work out the result", status: .fail,
        detail: "\(fn.name) always returns \(display), whatever it is given.", blocking: true,
        hint: "The answer depends on the value passed in, so \(fn.name) needs to use its parameter to work it out."
    )], tests: tests)
}
