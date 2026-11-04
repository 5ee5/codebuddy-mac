import Foundation

/// Mirrors `lib/practice/checkers/fizzbuzz.ts`: parses a restricted `for` loop
/// into a tiny AST, then interprets it for i = start...end.

private indirect enum JsExpr {
    case num(Double)
    case variable
    case mod(JsExpr, JsExpr)
    case compare(op: String, JsExpr, JsExpr)
    case not(JsExpr)
    case logic(op: String, JsExpr, JsExpr)
}

private indirect enum JsStmt {
    case block([JsStmt])
    case ifStmt(test: JsExpr, then: JsStmt, otherwise: JsStmt?)
    case log(text: String?)
}

private struct FizzProgram {
    let start: Int
    let end: Int
    let body: JsStmt
}

private struct Unsupported: Error {}

private final class FizzBuzzParser {
    let tokens: [JsToken]
    var pos = 0
    var depth = 0
    var variable = ""

    init(_ tokens: [JsToken]) { self.tokens = tokens }

    private func peek() -> JsToken? { pos < tokens.count ? tokens[pos] : nil }

    private func isOpTok(_ value: String) -> Bool {
        if case let .op(v)? = peek()?.kind { return v == value }
        return false
    }
    private func isNameTok(_ value: String) -> Bool {
        if case let .name(v)? = peek()?.kind { return v == value }
        return false
    }
    private func consumeOp(_ value: String) throws {
        guard isOpTok(value) else { throw Unsupported() }
        pos += 1
    }
    @discardableResult
    private func consumeName(_ value: String? = nil) throws -> String {
        guard case let .name(v)? = peek()?.kind, value == nil || v == value else { throw Unsupported() }
        pos += 1
        return v
    }
    private func consumeInt() throws -> Int {
        guard case let .num(v)? = peek()?.kind, v.rounded() == v else { throw Unsupported() }
        pos += 1
        return Int(v)
    }
    private func nested<T>(_ body: () throws -> T) throws -> T {
        depth += 1
        defer { depth -= 1 }
        guard depth <= 20 else { throw Unsupported() }
        return try body()
    }

    private func atom() throws -> JsExpr {
        try nested {
            if case let .num(v)? = peek()?.kind { pos += 1; return .num(v) }
            if case let .name(v)? = peek()?.kind, v == variable { pos += 1; return .variable }
            try consumeOp("(")
            let inner = try orExpr()
            try consumeOp(")")
            return inner
        }
    }
    private func modExpr() throws -> JsExpr {
        let left = try atom()
        guard isOpTok("%") else { return left }
        pos += 1
        return .mod(left, try atom())
    }
    private func unary() throws -> JsExpr {
        guard isOpTok("!") else { return try modExpr() }
        pos += 1
        return try nested { .not(try unary()) }
    }
    private func compareExpr() throws -> JsExpr {
        let left = try unary()
        guard case let .op(v)? = peek()?.kind, ["===", "==", "!==", "!="].contains(v) else { return left }
        pos += 1
        return .compare(op: v, left, try unary())
    }
    private func andExpr() throws -> JsExpr {
        var left = try compareExpr()
        while isOpTok("&&") { pos += 1; left = .logic(op: "&&", left, try compareExpr()) }
        return left
    }
    private func orExpr() throws -> JsExpr {
        var left = try andExpr()
        while isOpTok("||") { pos += 1; left = .logic(op: "||", left, try andExpr()) }
        return left
    }

    private func statement() throws -> JsStmt {
        try nested { () throws -> JsStmt in
            if isOpTok(";") { pos += 1; return .block([]) }
            if isOpTok("{") {
                pos += 1
                var body: [JsStmt] = []
                while !isOpTok("}") { body.append(try statement()) }
                pos += 1
                return .block(body)
            }
            if isNameTok("if") {
                pos += 1
                try consumeOp("(")
                let test = try orExpr()
                try consumeOp(")")
                let then = try statement()
                var otherwise: JsStmt?
                if isNameTok("else") { pos += 1; otherwise = try statement() }
                return .ifStmt(test: test, then: then, otherwise: otherwise)
            }
            try consumeName("console")
            try consumeOp(".")
            try consumeName("log")
            try consumeOp("(")
            var text: String?
            guard let token = peek() else { throw Unsupported() }
            switch token.kind {
            case let .str(value, interpolated):
                guard !interpolated else { throw Unsupported() }
                text = value
            case let .name(v) where v == variable:
                text = nil
            default:
                throw Unsupported()
            }
            pos += 1
            try consumeOp(")")
            if isOpTok(";") {
                pos += 1
            } else if let next = peek(), !next.newline, !isOpTok("}") {
                throw Unsupported()
            }
            return .log(text: text)
        }
    }

    func parseProgram() -> FizzProgram? {
        do {
            try consumeName("for")
            try consumeOp("(")
            if isNameTok("let") || isNameTok("var") { pos += 1 }
            variable = try consumeName()
            try consumeOp("=")
            let start = try consumeInt()
            try consumeOp(";")
            try consumeName(variable)
            let inclusive = isOpTok("<=")
            if inclusive { pos += 1 } else { try consumeOp("<") }
            let limit = try consumeInt()
            try consumeOp(";")
            if isOpTok("++") {
                pos += 1
                try consumeName(variable)
            } else {
                try consumeName(variable)
                if isOpTok("++") {
                    pos += 1
                } else {
                    try consumeOp("+=")
                    guard try consumeInt() == 1 else { throw Unsupported() }
                }
            }
            try consumeOp(")")
            let body = try statement()
            while isOpTok(";") { pos += 1 }
            guard pos == tokens.count else { return nil }
            return FizzProgram(start: start, end: inclusive ? limit : limit - 1, body: body)
        } catch {
            return nil
        }
    }
}

private enum JsValue {
    case number(Double)
    case bool(Bool)

    var asNumber: Double {
        switch self {
        case let .number(n): return n
        case let .bool(b): return b ? 1 : 0
        }
    }
    var isTruthy: Bool {
        switch self {
        case let .number(n): return n != 0 && !n.isNaN
        case let .bool(b): return b
        }
    }
}

private func evaluate(_ expr: JsExpr, _ i: Int) -> JsValue {
    switch expr {
    case let .num(v): return .number(v)
    case .variable: return .number(Double(i))
    case let .mod(l, r): return .number(evaluate(l, i).asNumber.truncatingRemainder(dividingBy: evaluate(r, i).asNumber))
    case let .not(e): return .bool(!evaluate(e, i).isTruthy)
    case let .logic(op, l, r):
        let lv = evaluate(l, i)
        if op == "&&" { return lv.isTruthy ? evaluate(r, i) : lv }
        return lv.isTruthy ? lv : evaluate(r, i)
    case let .compare(op, l, r):
        let lv = evaluate(l, i)
        let rv = evaluate(r, i)
        let strict = op.count == 3
        let equal: Bool
        if strict {
            switch (lv, rv) {
            case let (.number(a), .number(b)): equal = a == b
            case let (.bool(a), .bool(b)): equal = a == b
            default: equal = false
            }
        } else {
            equal = lv.asNumber == rv.asNumber
        }
        return .bool(op.hasPrefix("!") ? !equal : equal)
    }
}

private func run(_ stmt: JsStmt, _ i: Int, _ out: inout [String]) {
    switch stmt {
    case let .block(body): for s in body { run(s, i, &out) }
    case let .ifStmt(test, then, otherwise):
        if evaluate(test, i).isTruthy { run(then, i, &out) }
        else if let otherwise { run(otherwise, i, &out) }
    case let .log(text):
        out.append(text ?? String(i))
    }
}

private let FIZZ_GROUPS: [(label: String, numbers: [Int], expected: String)] = [
    ("Multiples of 3 print Fizz", [3, 6, 9, 12], "Fizz"),
    ("Multiples of 5 print Buzz", [5, 10], "Buzz"),
    ("Multiples of 3 and 5 print FizzBuzz", [15], "FizzBuzz"),
    ("Other numbers print themselves", [1, 2, 4, 7, 8, 11, 13, 14], "the number"),
]
private let FIZZ_COUNT_LABEL = "Prints one line for each number from 1 to 15"
private let FIZZ_COUNT_EXPECTED = "15 lines, for 1 to 15"
private let FIZZ_MAX_ITERATIONS = 1000

private func describeLines(_ lines: [String]?) -> String {
    guard let lines, !lines.isEmpty else { return "nothing" }
    return lines.joined(separator: ", ")
}
private func expectedFor(_ n: Int) -> String {
    if n % 15 == 0 { return "FizzBuzz" }
    if n % 3 == 0 { return "Fizz" }
    if n % 5 == 0 { return "Buzz" }
    return String(n)
}

private func buildFizzTests(_ program: FizzProgram) -> (tests: [TestCaseResult], hint: String)? {
    let iterationCount = program.end >= program.start ? program.end - program.start + 1 : 0
    guard iterationCount <= FIZZ_MAX_ITERATIONS else { return nil }

    var printed: [Int: [String]] = [:]
    if program.start <= program.end {
        for i in program.start...program.end {
            var out: [String] = []
            run(program.body, i, &out)
            printed[i] = out
        }
    }

    let extraLines = printed.first { $0.value.count != 1 }
    let countPasses = program.start == 1 && program.end == 15 && extraLines == nil
    let countActual: String
    if printed.isEmpty {
        countActual = "the loop never runs"
    } else if program.start != 1 || program.end != 15 {
        countActual = "numbers \(program.start) to \(program.end)"
    } else if let extraLines {
        countActual = "\(extraLines.key) printed \(extraLines.value.isEmpty ? "nothing" : "\(extraLines.value.count) lines: \(describeLines(extraLines.value))")"
    } else {
        countActual = FIZZ_COUNT_EXPECTED
    }

    var tests: [TestCaseResult] = [
        TestCaseResult(label: FIZZ_COUNT_LABEL, call: "1 to 15", expected: FIZZ_COUNT_EXPECTED, actual: countActual, passed: countPasses),
    ]
    for group in FIZZ_GROUPS {
        let wrong = group.numbers.first { describeLines(printed[$0]) != expectedFor($0) }
        let actual = wrong.map { "\($0) printed \(describeLines(printed[$0]))" } ?? group.expected
        tests.append(TestCaseResult(
            label: group.label, call: group.numbers.map(String.init).joined(separator: ", "),
            expected: group.expected, actual: actual, passed: wrong == nil
        ))
    }

    let fifteen = describeLines(printed[15])
    let hint: String
    if fifteen == "Fizz" || fifteen == "Buzz" {
        hint = "15 is a multiple of both 3 and 5, but your code printed \(fifteen). Which condition has to be tested first?"
    } else if let extraLines, extraLines.value.count > 1 {
        hint = "Some numbers print more than one line. Use else if and else so that only one branch runs for each number."
    } else if program.start != 1 || program.end != 15 {
        hint = "Check where your loop starts and stops: it should visit every number from 1 up to and including 15."
    } else {
        hint = "Compare the expected and actual output for the numbers listed above."
    }

    return (tests, hint)
}

func checkFizzBuzz(_ code: String) -> CheckerOutput {
    let scan = scanJavaScript(code)
    if let error = scan.error { return unreadable(error) }

    var checks: [RequirementCheck] = []
    let prints = scan.maskedString.range(of: #"\bconsole\s*\.\s*log\s*\("#, options: .regularExpression) != nil
    guard prints else {
        checks.append(RequirementCheck(
            id: "prints", label: "Prints with console.log", status: .fail,
            detail: "CodeBuddy couldn't find console.log, so nothing is printed.", blocking: true,
            hint: "In JavaScript, console.log(value) prints a value on its own line."
        ))
        return CheckerOutput(checks: checks, tests: [])
    }
    checks.append(RequirementCheck(id: "prints", label: "Prints with console.log", status: .pass))

    let literals = scan.strings.values.compactMap { $0.interpolated ? nil : $0.value }
    let words = ["Fizz", "Buzz", "FizzBuzz"]
    let nearMisses = literals.filter { $0.range(of: "fizz|buzz", options: [.regularExpression, .caseInsensitive]) != nil && !words.contains($0) }
    let missing = ["Fizz", "Buzz"].filter { !literals.contains($0) }

    if !nearMisses.isEmpty {
        checks.append(RequirementCheck(
            id: "words", label: "Uses the exact words Fizz, Buzz and FizzBuzz", status: .fail,
            detail: "Found \(nearMisses.map { "\u{201c}\($0)\u{201d}" }.joined(separator: ", ")). The output must match exactly.",
            hint: "Check capital letters and spaces: Fizz, Buzz and FizzBuzz each start with a capital letter and have no spaces."
        ))
    } else if !missing.isEmpty {
        checks.append(RequirementCheck(
            id: "words", label: "Uses the exact words Fizz, Buzz and FizzBuzz", status: .fail,
            detail: "Your code doesn't print \(missing.joined(separator: " or ")) yet.",
            hint: "Multiples of 3 print the word Fizz instead of the number, and multiples of 5 print Buzz."
        ))
    } else {
        checks.append(RequirementCheck(id: "words", label: "Uses the exact words Fizz, Buzz and FizzBuzz", status: .pass))
    }

    let allCases: [(label: String, call: String, expected: String)] =
        [(FIZZ_COUNT_LABEL, "1 to 15", FIZZ_COUNT_EXPECTED)] +
        FIZZ_GROUPS.map { (label: $0.label, call: $0.numbers.map(String.init).joined(separator: ", "), expected: $0.expected) }

    guard let tokens = jsTokens(scan), let program = FizzBuzzParser(tokens).parseProgram(), let result = buildFizzTests(program) else {
        return CheckerOutput(checks: checks, tests: unverifiedTests(allCases))
    }

    return CheckerOutput(checks: checks, tests: result.tests, testHint: result.hint)
}
