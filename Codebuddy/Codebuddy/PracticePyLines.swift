import Foundation

/// Mirrors the logical-line and function-finding parts of `lib/practice/python.ts`.

struct PyLine {
    /// Char offset of the first non-blank character, in the original source.
    let start: Int
    /// Masked line text, continuation-joined, indentation stripped, trimmed.
    let text: String
    /// Indentation width; a tab advances to the next multiple of 8.
    let indent: Int
    let tab: Bool
    /// 1-indexed source line of the first physical line.
    let line: Int
}

private func indentOf(_ chars: ArraySlice<Character>) -> (width: Int, hasTab: Bool) {
    var width = 0
    var hasTab = false
    for ch in chars {
        if ch == "\t" {
            hasTab = true
            width = (width / 8 + 1) * 8
        } else if ch == " " {
            width += 1
        } else {
            break
        }
    }
    return (width, hasTab)
}

/// Splits `scan.masked` into logical lines, joining continuation lines
/// (unclosed brackets, or a trailing backslash) and dropping blank/comment-only lines.
func pythonLines(_ scan: ScannedSource) -> [PyLine] {
    let masked = scan.masked
    let n = masked.count

    // Physical lines as (start, end) half-open ranges, not including the newline.
    var physical: [(start: Int, end: Int)] = []
    var lineStart = 0
    var k = 0
    while k < n {
        if masked[k] == "\n" {
            physical.append((lineStart, k))
            lineStart = k + 1
        }
        k += 1
    }
    physical.append((lineStart, n))

    var result: [PyLine] = []
    var i = 0
    while i < physical.count {
        let (s, e) = physical[i]
        let content = masked[s..<e]
        let isBlank = content.allSatisfy { $0 == " " || $0 == "\t" }
        if isBlank {
            i += 1
            continue
        }

        let (indent, hasTab) = indentOf(content)
        let firstNonBlank = s + content.prefix(while: { $0 == " " || $0 == "\t" }).count
        let lineNumber = i + 1

        var collected: [Character] = []
        var depth = 0
        var j = i
        while true {
            let (js, je) = physical[j]
            let lineChars = Array(masked[js..<je])
            for ch in lineChars {
                if ch == "(" || ch == "[" || ch == "{" { depth += 1 }
                else if ch == ")" || ch == "]" || ch == "}" { depth = max(0, depth - 1) }
            }
            var rstripEnd = lineChars.count
            while rstripEnd > 0 && (lineChars[rstripEnd - 1] == " " || lineChars[rstripEnd - 1] == "\t") {
                rstripEnd -= 1
            }
            let endsWithBackslash = rstripEnd > 0 && lineChars[rstripEnd - 1] == "\\"

            if endsWithBackslash {
                collected.append(contentsOf: lineChars[0..<(rstripEnd - 1)])
                collected.append(" ")
            } else {
                collected.append(contentsOf: lineChars)
            }

            if depth > 0 || endsWithBackslash {
                collected.append(" ")
                j += 1
                if j >= physical.count { break }
                continue
            } else {
                break
            }
        }

        // Strip this logical line's own leading indentation, then trim trailing whitespace.
        var textChars = collected
        let stripLead = min(indent, textChars.count)
        if stripLead > 0 { textChars.removeFirst(stripLead) }
        while let last = textChars.last, last == " " || last == "\t" {
            textChars.removeLast()
        }

        result.append(PyLine(start: firstNonBlank, text: String(textChars), indent: indent, tab: hasTab, line: lineNumber))
        i = j + 1
    }

    return result
}

/// True for a placeholder body: `pass`, `...`, or a bare docstring line.
func isPlaceholder(_ line: PyLine, _ scan: ScannedSource) -> Bool {
    if line.text == "pass" || line.text == "..." { return true }
    if let literal = scan.strings[line.start], literal.end - line.start == line.text.count {
        return true
    }
    return false
}

struct PyFunction {
    let name: String
    /// `nil` entries are non-plain parameters (e.g. `*args`).
    let params: [String?]
    let def: PyLine
    let body: [PyLine]
}

private func matchDefHeader(_ chars: [Character]) -> (name: String, openParenIndex: Int)? {
    guard chars.count > 3, chars[0] == "d", chars[1] == "e", chars[2] == "f" else { return nil }
    var i = 3
    guard i < chars.count, chars[i] == " " || chars[i] == "\t" else { return nil }
    while i < chars.count, chars[i] == " " || chars[i] == "\t" { i += 1 }
    let nameStart = i
    guard i < chars.count, chars[i].isLetter || chars[i] == "_" else { return nil }
    while i < chars.count, chars[i].isLetter || chars[i].isNumber || chars[i] == "_" { i += 1 }
    let name = String(chars[nameStart..<i])
    while i < chars.count, chars[i] == " " || chars[i] == "\t" { i += 1 }
    guard i < chars.count, chars[i] == "(" else { return nil }
    return (name, i)
}

private func findMatchingParen(_ chars: [Character], openIndex: Int) -> Int? {
    var depth = 1
    var i = openIndex + 1
    while i < chars.count {
        if chars[i] == "(" { depth += 1 }
        else if chars[i] == ")" { depth -= 1; if depth == 0 { return i } }
        i += 1
    }
    return nil
}

private func findSignatureColon(_ chars: [Character], from start: Int) -> Int? {
    var depth = 0
    var i = start
    while i < chars.count {
        let c = chars[i]
        if c == "(" || c == "[" || c == "{" { depth += 1 }
        else if c == ")" || c == "]" || c == "}" { depth -= 1 }
        else if c == ":" && depth == 0 { return i }
        i += 1
    }
    return nil
}

func splitTopLevel(_ text: String) -> [String] {
    let chars = Array(text)
    var parts: [String] = []
    var depth = 0
    var current = ""
    for c in chars {
        if c == "(" || c == "[" || c == "{" { depth += 1 }
        else if c == ")" || c == "]" || c == "}" { depth -= 1 }
        if c == "," && depth == 0 {
            parts.append(current)
            current = ""
        } else {
            current.append(c)
        }
    }
    parts.append(current)
    return parts.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
}

private func parseParamName(_ raw: String) -> String? {
    let chars = Array(raw)
    var i = 0
    while i < chars.count, chars[i] == " " { i += 1 }
    guard i < chars.count, chars[i].isLetter || chars[i] == "_" else { return nil }
    let start = i
    while i < chars.count, chars[i].isLetter || chars[i].isNumber || chars[i] == "_" { i += 1 }
    let name = String(chars[start..<i])
    while i < chars.count, chars[i] == " " { i += 1 }
    if i < chars.count, chars[i] == ":" {
        var depth = 0
        i += 1
        while i < chars.count {
            let c = chars[i]
            if c == "(" || c == "[" || c == "{" { depth += 1 }
            else if c == ")" || c == "]" || c == "}" { depth -= 1 }
            else if c == "=" && depth == 0 { break }
            i += 1
        }
    }
    while i < chars.count, chars[i] == " " { i += 1 }
    if i < chars.count, chars[i] == "=" { return name }
    return i == chars.count ? name : nil
}

/// Finds every top-level `def name(...):` and its body.
func pythonFunctions(_ lines: [PyLine]) -> [PyFunction] {
    var result: [PyFunction] = []
    var i = 0
    while i < lines.count {
        let line = lines[i]
        guard line.indent == 0 else { i += 1; continue }
        let chars = Array(line.text)
        guard let (name, openParen) = matchDefHeader(chars),
              let closeParen = findMatchingParen(chars, openIndex: openParen)
        else { i += 1; continue }

        var tailStart = closeParen + 1
        // Skip an optional `-> ReturnType` before the signature colon.
        var afterArrowCheck = tailStart
        while afterArrowCheck < chars.count, chars[afterArrowCheck] == " " { afterArrowCheck += 1 }
        if afterArrowCheck + 1 < chars.count, chars[afterArrowCheck] == "-", chars[afterArrowCheck + 1] == ">" {
            tailStart = afterArrowCheck + 2
        }
        guard let colonIndex = findSignatureColon(chars, from: tailStart) else { i += 1; continue }

        let paramsText = String(chars[(openParen + 1)..<closeParen])
        let params = splitTopLevel(paramsText).map { parseParamName($0) }

        var bodyStart = colonIndex + 1
        while bodyStart < chars.count, chars[bodyStart] == " " { bodyStart += 1 }

        var body: [PyLine] = []
        var next = i + 1
        if bodyStart < chars.count {
            let inlineText = String(chars[bodyStart...])
            body = [PyLine(start: line.start + bodyStart, text: inlineText, indent: line.indent + 1, tab: false, line: line.line)]
        } else {
            while next < lines.count, lines[next].indent > line.indent {
                body.append(lines[next])
                next += 1
            }
        }

        result.append(PyFunction(name: name, params: params, def: line, body: body))
        i = next
    }
    return result
}
