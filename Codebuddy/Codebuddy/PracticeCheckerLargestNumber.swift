import Foundation

/// Mirrors `lib/practice/checkers/largest-number.ts`.

private enum KeepKind { case bigger, smaller, every }
private enum StartSpec { case dynamic, value(Double) }

private struct LargestModel {
    let start: StartSpec
    let skipFirst: Bool
    let keep: KeepKind
    let returnInLoop: Bool
    let returnAfterLoop: Bool
}

private func parseStartValue(_ initLine: PyLine, _ scan: ScannedSource, _ param: String) -> StartSpec? {
    guard let tokens = lineTokens(scan, initLine), tokens.count >= 3, case .name = tokens[0], isOp(tokens[1], "=") else { return nil }
    let rhs = Array(tokens[2...])

    if rhs.count == 4, case let .name(p) = rhs[0], p == param, isOp(rhs[1], "["), case let .num(idx, _) = rhs[2], idx == 0, isOp(rhs[3], "]") {
        return .dynamic
    }
    if rhs.count == 1, case let .num(v, _) = rhs[0] { return .value(v) }
    if rhs.count == 2, isOp(rhs[0], "-"), case let .num(v, _) = rhs[1] { return .value(-v) }

    var outerNeg = false
    var r = rhs
    if let f = r.first, isOp(f, "-") { outerNeg = true; r = Array(r.dropFirst()) }
    guard r.count == 4, isName(r[0], "float"), isOp(r[1], "("), isOp(r[3], ")"),
          case let .str(prefix, value) = r[2], !prefix.contains("f"), !prefix.contains("b")
    else { return nil }
    var innerNeg = false
    var text = value
    if text.hasPrefix("-") { innerNeg = true; text.removeFirst() }
    guard text.lowercased() == "inf" || text.lowercased() == "infinity" else { return nil }
    return .value((outerNeg != innerNeg) ? -Double.infinity : Double.infinity)
}

private func parseIterable(_ iterCompact: String, param: String, loopVar: String) -> (skipFirst: Bool, itemText: String)? {
    if iterCompact == param { return (false, loopVar) }
    if iterCompact == "\(param)[1:]" { return (true, loopVar) }
    if iterCompact == "range(len(\(param)))" || iterCompact == "range(0,len(\(param)))" { return (false, "\(param)[\(loopVar)]") }
    if iterCompact == "range(1,len(\(param)))" { return (true, "\(param)[\(loopVar)]") }
    return nil
}

private func detectKeepKind(_ condition: String, itemText: String, accName: String) -> KeepKind? {
    var cond = condition
    if cond.hasPrefix("("), cond.hasSuffix(")") { cond = String(cond.dropFirst().dropLast()) }
    let bigger = ["\(itemText)>\(accName)", "\(itemText)>=\(accName)", "\(accName)<\(itemText)", "\(accName)<=\(itemText)"]
    let smaller = ["\(itemText)<\(accName)", "\(itemText)<=\(accName)", "\(accName)>\(itemText)", "\(accName)>=\(itemText)"]
    if bigger.contains(cond) { return .bigger }
    if smaller.contains(cond) { return .smaller }
    return nil
}

private func matchUpdate(_ inLoop: [PyLine], accName: String, itemText: String) -> (keep: KeepKind, used: Int)? {
    let first = compact(inLoop[0].text)
    let setForm = "\(accName)=\(itemText)"
    if first == setForm { return (.every, 1) }

    if first.hasPrefix("if"), first.hasSuffix(":\(setForm)") {
        let condPart = String(first.dropFirst(2).dropLast(setForm.count + 1))
        guard let kind = detectKeepKind(condPart, itemText: itemText, accName: accName) else { return nil }
        return (kind, 1)
    }

    if first.hasPrefix("if"), first.hasSuffix(":") {
        let condPart = String(first.dropFirst(2).dropLast())
        guard let kind = detectKeepKind(condPart, itemText: itemText, accName: accName) else { return nil }
        guard inLoop.count >= 2, compact(inLoop[1].text) == setForm else { return nil }
        return (kind, 2)
    }

    return nil
}

private func buildLargestModel(_ scan: ScannedSource, _ lines: [PyLine], _ fn: PyFunction) -> LargestModel? {
    let body = statements(fn, scan)
    guard body.count >= 3, let param = fn.params[0], boundOnce(lines, fn.name) else { return nil }

    let initLine = body[0]
    let loopLine = body[1]
    guard initLine.indent == loopLine.indent else { return nil }
    let baseIndent = initLine.indent

    guard let startSpec = parseStartValue(initLine, scan, param) else { return nil }
    guard let (loopVar, iterable) = parseForHeader(loopLine.text) else { return nil }
    guard let (skipFirst, itemText) = parseIterable(compact(iterable), param: param, loopVar: loopVar) else { return nil }
    guard let accTokens = lineTokens(scan, initLine), case let .name(accName) = accTokens[0] else { return nil }

    let rest = Array(body[2...])
    var idx = 0
    var inLoop: [PyLine] = []
    while idx < rest.count, rest[idx].indent > baseIndent {
        inLoop.append(rest[idx])
        idx += 1
    }
    let after = Array(rest[idx...])
    guard !inLoop.isEmpty, after.allSatisfy({ $0.indent == baseIndent }) else { return nil }

    guard let (keep, used) = matchUpdate(inLoop, accName: accName, itemText: itemText) else { return nil }

    let tail = Array(inLoop[used...])
    var returnInLoop = false
    if !tail.isEmpty {
        guard tail.count == 1, compact(tail[0].text) == "return\(accName)" else { return nil }
        returnInLoop = true
    }

    var returnAfterLoop = false
    if after.count == 1 {
        guard compact(after[0].text) == "return\(accName)" else { return nil }
        returnAfterLoop = true
    } else if !after.isEmpty {
        return nil
    }

    return LargestModel(start: startSpec, skipFirst: skipFirst, keep: keep, returnInLoop: returnInLoop, returnAfterLoop: returnAfterLoop)
}

private func runLargestModel(_ model: LargestModel, _ list: [Double]) -> Double? {
    var kept: Double
    switch model.start {
    case .dynamic:
        guard let first = list.first else { return nil }
        kept = first
    case let .value(v):
        kept = v
    }

    let items = model.skipFirst ? Array(list.dropFirst()) : list
    for value in items {
        let replace: Bool
        switch model.keep {
        case .every: replace = true
        case .bigger: replace = value > kept
        case .smaller: replace = value < kept
        }
        if replace { kept = value }
        if model.returnInLoop { return kept }
    }
    return model.returnAfterLoop ? kept : nil
}

func checkLargestNumber(_ code: String) -> CheckerOutput {
    let scan = scanPython(code)
    if let error = scan.error { return unreadable(error) }
    let lines = pythonLines(scan)

    let rawCases: [(label: String, list: [Int], expected: Int)] = [
        ("The example list", [3, 9, 4], 9),
        ("Only negative numbers", [-5, -2, -8], -2),
        ("A single number", [7], 7),
        ("The biggest comes first", [10, 3, 5], 10),
    ]
    let cases = rawCases.map { (label: $0.label, call: "largest([\($0.list.map(String.init).joined(separator: ", "))])") }
    let expectedDisplays = rawCases.map { String($0.expected) }
    let fullCases = (0..<rawCases.count).map { (label: cases[$0].label, call: cases[$0].call, expected: expectedDisplays[$0]) }

    let (checksBase, fnOpt) = checkPythonFunction(scan, lines, name: "largest", param: "numbers")
    guard let fn = fnOpt else {
        return CheckerOutput(checks: checksBase, tests: testsWithoutFunction(checksBase, fullCases))
    }
    var checks = checksBase

    if let line = firstMatchLine(#"(^|[^\w.])max\s*\("#, in: scan) {
        checks.append(RequirementCheck(
            id: "no-max", label: "Doesn't use the built-in max()", status: .fail,
            detail: "Line \(line) calls max().",
            hint: "This exercise is about finding the biggest number yourself. Keep the biggest number so far, and compare each number with it."
        ))
    } else {
        checks.append(RequirementCheck(id: "no-max", label: "Doesn't use the built-in max()", status: .pass))
    }

    let body = statements(fn, scan)
    if body.contains(where: { isLoopLine($0.text) }) {
        if let returnLine = returnInsideLoop(body) {
            checks.append(RequirementCheck(
                id: "return-after-loop", label: "Returns only after the loop has finished", status: .fail,
                detail: "The return on line \(returnLine.line) is inside the loop, so the function stops after the first number.",
                hint: "Indentation decides what belongs to the loop. Which lines should run once per number, and which only once at the end?"
            ))
        } else {
            checks.append(RequirementCheck(id: "return-after-loop", label: "Returns only after the loop has finished", status: .pass))
        }
    }

    if let constant = constantReturnResults(scan, lines, fn, cases, expectedDisplays: expectedDisplays) {
        return CheckerOutput(checks: checks + constant.checks, tests: constant.tests)
    }

    guard topLevelSupported(scan, lines, fn), let model = buildLargestModel(scan, lines, fn) else {
        return CheckerOutput(checks: checks, tests: unverifiedTests(fullCases))
    }

    var tests: [TestCaseResult] = []
    for (i, rawCase) in rawCases.enumerated() {
        let result = runLargestModel(model, rawCase.list.map(Double.init))
        let actual = result.map { formatNumberDisplay($0, isFloat: false) } ?? "None"
        let passed = result == Double(rawCase.expected)
        tests.append(TestCaseResult(label: fullCases[i].label, call: fullCases[i].call, expected: fullCases[i].expected, actual: actual, passed: passed))
    }

    let otherFailed = tests.enumerated().contains { $0.offset != 1 && $0.element.passed == false }
    let onlyNegativeFailed = tests[1].passed == false && !otherFailed
    let hint = onlyNegativeFailed
        ? "What does your function give back when every number is negative? Check that your starting value is one of the numbers in the list."
        : "Follow your loop by hand for [3, 9, 4]: write down the biggest number so far after each step."

    return CheckerOutput(checks: checks, tests: tests, testHint: hint)
}
