import Foundation

/// Mirrors `lib/practice/javascript.ts`: a deliberately tiny tokenizer, just
/// enough to recognize the restricted FizzBuzz `for` loop shape.

enum JsTokenKind {
    case str(value: String, interpolated: Bool)
    case num(Double)
    case name(String)
    case op(String)
}

struct JsToken {
    let kind: JsTokenKind
    var newline: Bool = false
}

private let JS_TWO_CHAR_OPS = ["==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "=>"]

private func isJsIdentStart(_ c: Character) -> Bool { c.isLetter || c == "_" || c == "$" }
private func isJsIdentChar(_ c: Character) -> Bool { c.isLetter || c.isNumber || c == "_" || c == "$" }

/// Returns `nil` if the source is too complex to tokenize (more than 2000 tokens).
func jsTokens(_ scan: ScannedSource) -> [JsToken]? {
    let masked = scan.masked
    let n = masked.count
    var i = 0
    var tokens: [JsToken] = []
    var pendingNewline = false

    while i < n {
        let c = masked[i]

        if c == "\n" {
            pendingNewline = true
            i += 1
            continue
        }
        if c == " " || c == "\t" || c == "\r" {
            i += 1
            continue
        }

        if let literal = scan.strings[i] {
            tokens.append(JsToken(kind: .str(value: literal.value, interpolated: literal.interpolated), newline: pendingNewline))
            pendingNewline = false
            i = literal.end
            if tokens.count > 2000 { return nil }
            continue
        }

        if isJsIdentStart(c) {
            var j = i + 1
            while j < n && isJsIdentChar(masked[j]) { j += 1 }
            tokens.append(JsToken(kind: .name(String(masked[i..<j])), newline: pendingNewline))
            pendingNewline = false
            i = j
            if tokens.count > 2000 { return nil }
            continue
        }

        if c.isNumber {
            var j = i + 1
            while j < n && (masked[j].isNumber || masked[j] == ".") { j += 1 }
            let text = String(masked[i..<j])
            tokens.append(JsToken(kind: .num(Double(text) ?? 0), newline: pendingNewline))
            pendingNewline = false
            i = j
            if tokens.count > 2000 { return nil }
            continue
        }

        var matchedOp: String?
        if i + 2 < n {
            let three = String(masked[i...(i + 2)])
            if three == "===" || three == "!==" { matchedOp = three }
        }
        if matchedOp == nil, i + 1 < n {
            let two = String(masked[i...(i + 1)])
            if JS_TWO_CHAR_OPS.contains(two) { matchedOp = two }
        }
        let opText = matchedOp ?? String(c)
        tokens.append(JsToken(kind: .op(opText), newline: pendingNewline))
        pendingNewline = false
        i += opText.count

        if tokens.count > 2000 { return nil }
    }

    return tokens
}
