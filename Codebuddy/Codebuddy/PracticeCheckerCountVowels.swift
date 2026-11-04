import Foundation

/// Mirrors `lib/practice/checkers/count-vowels.ts`. Supports the two common
/// shapes: an explicit counting loop, and a `sum`/`len` comprehension.

private struct VowelModel {
    let changes: [String]
    let vowels: Set<Character>
}

private func countWith(_ model: VowelModel, _ text: String) -> Int {
    var count = 0
    for ch in text {
        var c = ch
        for change in model.changes {
            if change == "lower" { c = Character(String(c).lowercased()) }
            else if change == "upper" { c = Character(String(c).uppercased()) }
        }
        if model.vowels.contains(c) { count += 1 }
    }
    return count
}

private func matchCaseChangeExpr(_ tokens: [PyToken]) -> (varName: String, change: String?)? {
    guard let first = tokens.first, case let .name(varName) = first else { return nil }
    if tokens.count == 1 { return (varName, nil) }
    guard tokens.count == 5, isOp(tokens[1], "."), case let .name(method) = tokens[2], isOp(tokens[3], "("), isOp(tokens[4], ")") else { return nil }
    switch method {
    case "lower", "casefold": return (varName, "lower")
    case "upper": return (varName, "upper")
    default: return nil
    }
}

private func matchVowelSetTokens(_ tokens: [PyToken], constants: [String: Set<Character>]) -> Set<Character>? {
    if tokens.count == 1 {
        if case let .str(prefix, value) = tokens[0], !prefix.contains("f"), !prefix.contains("b") { return Set(value) }
        if case let .name(n) = tokens[0] { return constants[n] }
        return nil
    }
    guard tokens.count >= 2,
          case let .op(open) = tokens[0], ["[", "(", "{"].contains(open),
          case let .op(close) = tokens[tokens.count - 1], [")", "]", "}"].contains(close)
    else { return nil }
    var set = Set<Character>()
    var i = 1
    while i < tokens.count - 1 {
        guard case let .str(prefix, value) = tokens[i], !prefix.contains("f"), !prefix.contains("b"), value.count == 1 else { return nil }
        set.insert(value[value.startIndex])
        i += 1
        if i < tokens.count - 1 {
            guard isOp(tokens[i], ",") else { return nil }
            i += 1
        }
    }
    return set.isEmpty ? nil : set
}

private func matchConditionTokens(_ tokens: [PyToken], expectedVar: String, constants: [String: Set<Character>]) -> (change: String?, vowels: Set<Character>)? {
    var toks = tokens
    if case .op("(") = toks.first, case .op(")") = toks.last, toks.count >= 2 {
        toks = Array(toks[1..<(toks.count - 1)])
    }
    guard let inIdx = toks.firstIndex(where: { isName($0, "in") }) else { return nil }
    let left = Array(toks[0..<inIdx])
    let right = Array(toks[(inIdx + 1)...])
    guard let (varName, change) = matchCaseChangeExpr(left), varName == expectedVar else { return nil }
    guard let vowels = matchVowelSetTokens(right, constants: constants) else { return nil }
    return (change, vowels)
}

private func isTopLevelAssignTarget(_ line: PyLine, _ target: String, _ scan: ScannedSource) -> Bool {
    guard let tokens = lineTokens(scan, line), tokens.count >= 2, case let .name(n) = tokens[0] else { return false }
    return n == target && isOp(tokens[1], "=")
}

private func collectVowelConstants(_ lines: [PyLine], _ scan: ScannedSource, defLine: PyLine) -> [String: Set<Character>] {
    var constants: [String: Set<Character>] = [:]
    for line in lines where line.indent == 0 && line.line < defLine.line {
        guard let tokens = lineTokens(scan, line), tokens.count >= 3, case let .name(target) = tokens[0], isOp(tokens[1], "=") else { continue }
        guard lines.filter({ $0.indent == 0 && isTopLevelAssignTarget($0, target, scan) }).count == 1 else { continue }
        if let set = matchVowelSetTokens(Array(tokens[2...]), constants: constants) {
            constants[target] = set
        }
    }
    return constants
}

private func matchForIfClause(_ tokens: [PyToken], param: String, constants: [String: Set<Character>]) -> VowelModel? {
    guard isName(tokens.first, "for"), tokens.count > 2, case let .name(loopVar) = tokens[1], isName(tokens[2], "in") else { return nil }
    guard let ifIdx = tokens.firstIndex(where: { isName($0, "if") }), ifIdx > 3 else { return nil }
    let srcTokens = Array(tokens[3..<ifIdx])
    guard let (srcVar, srcChange) = matchCaseChangeExpr(srcTokens), srcVar == param else { return nil }
    let condTokens = Array(tokens[(ifIdx + 1)...])
    guard let (condChange, vowels) = matchConditionTokens(condTokens, expectedVar: loopVar, constants: constants) else { return nil }
    return VowelModel(changes: [srcChange, condChange].compactMap { $0 }, vowels: vowels)
}

private func matchComprehension(_ tokens: [PyToken], param: String, constants: [String: Set<Character>]) -> VowelModel? {
    if tokens.count >= 4, isName(tokens[0], "sum"), isOp(tokens[1], "("), isOp(tokens.last, ")") {
        var inner = Array(tokens[2..<(tokens.count - 1)])
        guard !inner.isEmpty, case let .num(v, _) = inner[0], v == 1 else { return nil }
        inner.removeFirst()
        return matchForIfClause(inner, param: param, constants: constants)
    }
    if tokens.count >= 5, isName(tokens[0], "len"), isOp(tokens[1], "("), isOp(tokens[2], "["), isOp(tokens[tokens.count - 1], ")"), isOp(tokens[tokens.count - 2], "]") {
        var inner = Array(tokens[3..<(tokens.count - 2)])
        guard case .name = inner.first else { return nil }
        inner.removeFirst()
        return matchForIfClause(inner, param: param, constants: constants)
    }
    return nil
}

private func isIncrementOf(_ tokens: [PyToken], _ counter: String) -> Bool {
    if tokens.count == 3, case let .name(n) = tokens[0], n == counter, isOp(tokens[1], "+="), case let .num(v, _) = tokens[2], v == 1 { return true }
    if tokens.count == 5, case let .name(n) = tokens[0], n == counter, isOp(tokens[1], "="), case let .name(n2) = tokens[2], n2 == counter, isOp(tokens[3], "+"), case let .num(v, _) = tokens[4], v == 1 { return true }
    return false
}

private func buildVowelModel(_ scan: ScannedSource, _ lines: [PyLine], _ fn: PyFunction) -> VowelModel? {
    guard let param = fn.params[0], boundOnce(lines, fn.name) else { return nil }
    let constants = collectVowelConstants(lines, scan, defLine: fn.def)

    let body = statements(fn, scan)
    guard !body.isEmpty else { return nil }
    let baseIndent = body[0].indent

    var idx = 0
    var counterName: String?
    if let tokens = lineTokens(scan, body[0]), body[0].indent == baseIndent, tokens.count == 3,
       case let .name(target) = tokens[0], isOp(tokens[1], "="), case let .num(v, _) = tokens[2], v == 0 {
        counterName = target
        idx = 1
    }

    let rest = Array(body[idx...])

    if rest.count == 1, let tokens = lineTokens(scan, rest[0]), isName(tokens.first, "return") {
        return matchComprehension(Array(tokens.dropFirst()), param: param, constants: constants)
    }

    guard let counter = counterName, rest.count >= 3, rest.count <= 4 else { return nil }
    guard let forTokens = lineTokens(scan, rest[0]), forTokens.count >= 5, isName(forTokens[0], "for"),
          case .name = forTokens[1], isName(forTokens[2], "in"), isOp(forTokens.last, ":")
    else { return nil }
    let iterTokens = Array(forTokens[3..<(forTokens.count - 1)])
    guard let (srcVar, srcChange) = matchCaseChangeExpr(iterTokens), srcVar == param, case let .name(loopVar) = forTokens[1] else { return nil }

    guard let ifTokens = lineTokens(scan, rest[1]), ifTokens.count >= 3, isName(ifTokens.first, "if"), isOp(ifTokens.last, ":") else { return nil }
    let condTokens = Array(ifTokens[1..<(ifTokens.count - 1)])
    guard let (condChange, vowels) = matchConditionTokens(condTokens, expectedVar: loopVar, constants: constants) else { return nil }

    var tailLines = Array(rest[2...])
    if let first = tailLines.first, let incTokens = lineTokens(scan, first), isIncrementOf(incTokens, counter) {
        tailLines.removeFirst()
    }
    guard tailLines.count == 1, tailLines[0].indent == baseIndent,
          let retTokens = lineTokens(scan, tailLines[0]), retTokens.count == 2,
          isName(retTokens[0], "return"), case let .name(rv) = retTokens[1], rv == counter
    else { return nil }

    return VowelModel(changes: [srcChange, condChange].compactMap { $0 }, vowels: vowels)
}

private func vowelHint(_ model: VowelModel) -> String {
    func counts(_ c: Character) -> Bool { countWith(model, String(c)) == 1 }
    let lower: [Character] = Array("aeiou")
    let upper: [Character] = Array("AEIOU")

    if zip(lower, upper).contains(where: { counts($0.0) && !counts($0.1) }) {
        return "Uppercase vowels aren't counted yet. What happens to the A in \"Apple\"? Hint 2 can help."
    }
    if zip(lower, upper).contains(where: { !counts($0.0) && counts($0.1) }) {
        return "Lowercase vowels aren't counted yet. Make sure both cases are handled."
    }

    var extra: [String] = []
    for c in "abcdefghijklmnopqrstuvwxyz" where !"aeiou".contains(c) {
        if counts(c) || counts(Character(String(c).uppercased())) { extra.append(String(c)) }
    }
    if !extra.isEmpty {
        return "Your code also counts \(extra.joined(separator: ", ")). Only a, e, i, o and u are vowels here."
    }

    var missing: [String] = []
    for c in lower where !(counts(c) || counts(Character(String(c).uppercased()))) {
        missing.append(String(c))
    }
    if !missing.isEmpty {
        return "Your code doesn't count \(missing.joined(separator: ", ")). Check your list of vowels."
    }

    return "Compare the expected and actual counts above and look for the letters that make the difference."
}

func checkCountVowels(_ code: String) -> CheckerOutput {
    let scan = scanPython(code)
    if let error = scan.error { return unreadable(error) }
    let lines = pythonLines(scan)

    let rawCases: [(label: String, text: String, expected: Int)] = [
        ("The example word", "Apple", 2),
        ("A longer word", "CodeBuddy", 3),
        ("An empty string", "", 0),
        ("Every vowel, both cases", "AEIOU aeiou", 10),
        ("A word with no vowels", "rhythm", 0),
        ("Punctuation and a space", "Hello, World!", 3),
    ]
    let cases = rawCases.map { (label: $0.label, call: "count_vowels(\(pythonRepr($0.text)))") }
    let expectedDisplays = rawCases.map { String($0.expected) }
    let fullCases = (0..<rawCases.count).map { (label: cases[$0].label, call: cases[$0].call, expected: expectedDisplays[$0]) }

    let (checksBase, fnOpt) = checkPythonFunction(scan, lines, name: "count_vowels", param: "text")
    guard let fn = fnOpt else {
        return CheckerOutput(checks: checksBase, tests: testsWithoutFunction(checksBase, fullCases))
    }
    let checks = checksBase

    if let constant = constantReturnResults(scan, lines, fn, cases, expectedDisplays: expectedDisplays) {
        return CheckerOutput(checks: checks + constant.checks, tests: constant.tests)
    }

    guard topLevelSupported(scan, lines, fn), let model = buildVowelModel(scan, lines, fn) else {
        return CheckerOutput(checks: checks, tests: unverifiedTests(fullCases))
    }

    var tests: [TestCaseResult] = []
    for (i, rawCase) in rawCases.enumerated() {
        let count = countWith(model, rawCase.text)
        tests.append(TestCaseResult(label: fullCases[i].label, call: fullCases[i].call, expected: fullCases[i].expected, actual: String(count), passed: count == rawCase.expected))
    }

    return CheckerOutput(checks: checks, tests: tests, testHint: vowelHint(model))
}
