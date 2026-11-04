import Foundation

/// Mirrors the token-level parts of `lib/practice/python.ts`.

enum PyToken {
    case str(prefix: String, value: String)
    case num(value: Double, isFloat: Bool)
    case name(String)
    case op(String)
}

private let PY_TWO_CHAR_OPS = ["==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "//", "**", "->"]

/// Returns `nil` if the span is too complex to tokenize (more than 400 tokens).
func pyTokens(_ scan: ScannedSource, _ start: Int, _ end: Int) -> [PyToken]? {
    let masked = scan.masked
    var i = start
    var tokens: [PyToken] = []

    while i < end {
        let c = masked[i]

        if c == " " || c == "\t" || c == "\n" || c == "\\" {
            i += 1
            continue
        }

        if let literal = scan.strings[i] {
            tokens.append(.str(prefix: literal.prefix, value: literal.value))
            i = literal.end
            if tokens.count > 400 { return nil }
            continue
        }

        if c.isLetter || c == "_" {
            var j = i + 1
            while j < end && (masked[j].isLetter || masked[j].isNumber || masked[j] == "_") { j += 1 }
            tokens.append(.name(String(masked[i..<j])))
            i = j
            if tokens.count > 400 { return nil }
            continue
        }

        if c.isNumber || (c == "." && i + 1 < end && masked[i + 1].isNumber) {
            var j = i + 1
            while j < end && (masked[j].isNumber || masked[j] == ".") { j += 1 }
            let text = String(masked[i..<j])
            tokens.append(.num(value: Double(text) ?? 0, isFloat: text.contains(".")))
            i = j
            if tokens.count > 400 { return nil }
            continue
        }

        var matched: String?
        if i + 1 < end {
            let two = String(masked[i...(i + 1)])
            if PY_TWO_CHAR_OPS.contains(two) { matched = two }
        }
        let opText = matched ?? String(c)
        tokens.append(.op(opText))
        i += opText.count
        if tokens.count > 400 { return nil }
    }

    return tokens
}

func lineTokens(_ scan: ScannedSource, _ line: PyLine) -> [PyToken]? {
    pyTokens(scan, line.start, line.start + line.text.count)
}

func isOp(_ token: PyToken?, _ value: String) -> Bool {
    if case let .op(v)? = token { return v == value }
    return false
}

func isName(_ token: PyToken?, _ value: String? = nil) -> Bool {
    if case let .name(v)? = token { return value == nil || v == value! }
    return false
}

/// Non-nil only for a plain (non-byte, non-f) string token.
func plainString(_ token: PyToken?) -> String? {
    if case let .str(prefix, value)? = token {
        if prefix.contains("b") || prefix.contains("f") { return nil }
        return value
    }
    return nil
}

/// A tiny recursive-descent evaluator for a string-valued expression made only
/// of: string literals (plain or f-string), `+` concatenation, parens, `str(x)`
/// calls, and bare names looked up in `env`. Returns `nil` for anything outside
/// this grammar.
func evalStringExpr(_ tokens: [PyToken], _ env: [String: String]) -> String? {
    var pos = 0
    var depth = 0

    func peek() -> PyToken? { pos < tokens.count ? tokens[pos] : nil }

    func evalFString(_ raw: String) -> String? {
        var result = ""
        var chars = Array(raw)
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if c == "{" {
                if i + 1 < chars.count, chars[i + 1] == "{" { result.append("{"); i += 2; continue }
                var j = i + 1
                while j < chars.count, chars[j] != "}" { j += 1 }
                guard j < chars.count else { return nil }
                var fieldChars = Array(chars[(i + 1)..<j])
                if fieldChars.count >= 2, fieldChars[fieldChars.count - 2] == "!", fieldChars.last == "s" {
                    fieldChars.removeLast(2)
                }
                let field = String(fieldChars).trimmingCharacters(in: .whitespaces)
                guard !field.isEmpty, field.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" }),
                      let value = env[field]
                else { return nil }
                result += value
                i = j + 1
                continue
            }
            if c == "}" {
                if i + 1 < chars.count, chars[i + 1] == "}" { result.append("}"); i += 2; continue }
                return nil
            }
            result.append(c)
            i += 1
        }
        return result
    }

    func atom() -> String? {
        depth += 1
        defer { depth -= 1 }
        guard depth <= 20 else { return nil }

        guard let token = peek() else { return nil }
        switch token {
        case let .str(prefix, value):
            pos += 1
            if prefix.contains("b") { return nil }
            if prefix.contains("f") { return evalFString(value) }
            return value
        case .name("str"):
            // str(x)
            guard pos + 1 < tokens.count, isOp(tokens[pos + 1], "(") else {
                if case let .name(n) = token { pos += 1; return env[n] }
                return nil
            }
            pos += 2
            guard let inner = orExpr() else { return nil }
            guard isOp(peek(), ")") else { return nil }
            pos += 1
            return inner
        case let .name(n):
            pos += 1
            return env[n]
        case .op("("):
            pos += 1
            guard let inner = orExpr() else { return nil }
            guard isOp(peek(), ")") else { return nil }
            pos += 1
            return inner
        default:
            return nil
        }
    }

    func orExpr() -> String? {
        guard var left = atom() else { return nil }
        while isOp(peek(), "+") {
            pos += 1
            guard let right = atom() else { return nil }
            left += right
        }
        return left
    }

    guard let result = orExpr(), pos == tokens.count else { return nil }
    return result
}

/// Mirrors `pythonRepr` for the string/None cases, which is all the port needs.
func pythonRepr(_ value: String?) -> String {
    guard let value else { return "None" }
    var out = "\""
    for ch in value {
        switch ch {
        case "\\": out += "\\\\"
        case "\"": out += "\\\""
        case "\n": out += "\\n"
        default: out.append(ch)
        }
    }
    out += "\""
    return out
}
