import Foundation

/// Mirrors `lib/practice/checkers/sum-list.ts`.

private enum SumOp { case add, sub, mul, set }
private enum SumSource { case item, constant(Double) }

private struct SumModel {
    let start: Double
    let isFloat: Bool
    let op: SumOp
    let source: SumSource
    let returnInLoop: Bool
    let returnAfterLoop: Bool
}

private func parseInitAssignment(_ compactText: String) -> (name: String, value: Double, isFloat: Bool)? {
    guard let eqIdx = compactText.firstIndex(of: "=") else { return nil }
    let name = String(compactText[compactText.startIndex..<eqIdx])
    guard !name.isEmpty, let first = name.first, first.isLetter || first == "_",
          name.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" })
    else { return nil }
    let rest = String(compactText[compactText.index(after: eqIdx)...])
    guard rest.range(of: #"^-?\d+(\.\d*)?$"#, options: .regularExpression) != nil, let value = Double(rest) else { return nil }
    return (name, value, rest.contains("."))
}

private func isIntegerLiteralText(_ s: String) -> Bool {
    !s.isEmpty && s.allSatisfy { $0.isNumber }
}

private func parseLoopUpdate(_ compacted: String, accName: String, itemText: String) -> (SumOp, SumSource)? {
    if compacted == "\(accName)+=\(itemText)" { return (.add, .item) }
    if compacted == "\(accName)=\(accName)+\(itemText)" { return (.add, .item) }
    if compacted == "\(accName)=\(itemText)+\(accName)" { return (.add, .item) }
    if compacted == "\(accName)-=\(itemText)" { return (.sub, .item) }
    if compacted == "\(accName)*=\(itemText)" { return (.mul, .item) }
    if compacted == "\(accName)=\(itemText)" { return (.set, .item) }

    let plusEqPrefix = "\(accName)+="
    if compacted.hasPrefix(plusEqPrefix) {
        let rest = String(compacted.dropFirst(plusEqPrefix.count))
        if isIntegerLiteralText(rest), let k = Double(rest) { return (.add, .constant(k)) }
    }
    let addAccPrefix = "\(accName)=\(accName)+"
    if compacted.hasPrefix(addAccPrefix) {
        let rest = String(compacted.dropFirst(addAccPrefix.count))
        if isIntegerLiteralText(rest), let k = Double(rest) { return (.add, .constant(k)) }
    }
    return nil
}

private func buildSumModel(_ scan: ScannedSource, _ lines: [PyLine], _ fn: PyFunction) -> SumModel? {
    let body = statements(fn, scan)
    guard body.count >= 3, let param = fn.params[0], boundOnce(lines, fn.name) else { return nil }

    let initLine = body[0]
    let loopLine = body[1]
    guard initLine.indent == loopLine.indent else { return nil }
    let baseIndent = initLine.indent

    guard let (accName, startValue, startIsFloat) = parseInitAssignment(compact(initLine.text)) else { return nil }
    guard let (loopVar, iterable) = parseForHeader(loopLine.text) else { return nil }

    let iterCompact = compact(iterable)
    let itemIsLoopVar: Bool
    if iterCompact == param { itemIsLoopVar = true }
    else if iterCompact == "range(len(\(param)))" || iterCompact == "range(0,len(\(param)))" { itemIsLoopVar = false }
    else { return nil }
    let itemText = itemIsLoopVar ? loopVar : "\(param)[\(loopVar)]"

    let rest = Array(body[2...])
    var idx = 0
    var inLoop: [PyLine] = []
    while idx < rest.count, rest[idx].indent > baseIndent {
        inLoop.append(rest[idx])
        idx += 1
    }
    let after = Array(rest[idx...])
    guard !inLoop.isEmpty, inLoop.count <= 2, inLoop.allSatisfy({ $0.indent == inLoop[0].indent }) else { return nil }
    guard after.allSatisfy({ $0.indent == baseIndent }) else { return nil }

    guard let (op, source) = parseLoopUpdate(compact(inLoop[0].text), accName: accName, itemText: itemText) else { return nil }

    var returnInLoop = false
    if inLoop.count == 2 {
        guard compact(inLoop[1].text) == "return\(accName)" else { return nil }
        returnInLoop = true
    }

    var returnAfterLoop = false
    if after.count == 1 {
        guard compact(after[0].text) == "return\(accName)" else { return nil }
        returnAfterLoop = true
    } else if !after.isEmpty {
        return nil
    }

    return SumModel(start: startValue, isFloat: startIsFloat, op: op, source: source, returnInLoop: returnInLoop, returnAfterLoop: returnAfterLoop)
}

private func runSumModel(_ model: SumModel, _ list: [Double]) -> Double? {
    var acc = model.start
    for value in list {
        let operand: Double
        switch model.source {
        case .item: operand = value
        case let .constant(k): operand = k
        }
        switch model.op {
        case .add: acc += operand
        case .sub: acc -= operand
        case .mul: acc *= operand
        case .set: acc = operand
        }
        if model.returnInLoop { return acc }
    }
    return model.returnAfterLoop ? acc : nil
}

func checkSumList(_ code: String) -> CheckerOutput {
    let scan = scanPython(code)
    if let error = scan.error { return unreadable(error) }
    let lines = pythonLines(scan)

    let rawCases: [(label: String, list: [Int], expected: Int)] = [
        ("The example list", [4, 8, 15], 27),
        ("An empty list", [], 0),
        ("A single number", [5], 5),
        ("Negative numbers and zero", [-3, 10, 0], 7),
    ]
    let cases = rawCases.map { (label: $0.label, call: "total([\($0.list.map(String.init).joined(separator: ", "))])") }
    let expectedDisplays = rawCases.map { String($0.expected) }
    let fullCases = (0..<rawCases.count).map { (label: cases[$0].label, call: cases[$0].call, expected: expectedDisplays[$0]) }

    let (checksBase, fnOpt) = checkPythonFunction(scan, lines, name: "total", param: "numbers")
    guard let fn = fnOpt else {
        return CheckerOutput(checks: checksBase, tests: testsWithoutFunction(checksBase, fullCases))
    }
    var checks = checksBase

    if let line = firstMatchLine(#"(^|[^\w.])sum\s*\(|\bfsum\s*\("#, in: scan) {
        checks.append(RequirementCheck(
            id: "no-sum", label: "Doesn't use the built-in sum()", status: .fail,
            detail: "Line \(line) calls sum().",
            hint: "This exercise is about adding the numbers up yourself. Start a running total at 0 and add each number to it."
        ))
    } else {
        checks.append(RequirementCheck(id: "no-sum", label: "Doesn't use the built-in sum()", status: .pass))
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

    guard topLevelSupported(scan, lines, fn), let model = buildSumModel(scan, lines, fn) else {
        return CheckerOutput(checks: checks, tests: unverifiedTests(fullCases))
    }

    var tests: [TestCaseResult] = []
    for (i, rawCase) in rawCases.enumerated() {
        let result = runSumModel(model, rawCase.list.map(Double.init))
        let actual = result.map { formatNumberDisplay($0, isFloat: model.isFloat) } ?? "None"
        let passed = result == Double(rawCase.expected)
        tests.append(TestCaseResult(label: fullCases[i].label, call: fullCases[i].call, expected: fullCases[i].expected, actual: actual, passed: passed))
    }

    let hint = tests[1].passed == false
        ? "What does your function give back for an empty list? The value you start with matters."
        : "Follow your loop by hand for [4, 8, 15]: write down the running total after each number."

    return CheckerOutput(checks: checks, tests: tests, testHint: hint)
}
