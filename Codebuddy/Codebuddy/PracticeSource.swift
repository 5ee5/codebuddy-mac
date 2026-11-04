import Foundation

/// Mirrors `lib/practice/source.ts`: masks comments and string-literal contents
/// (replacing them with spaces, newlines preserved) so later pattern matching
/// can search `masked` without being fooled by keywords inside strings or
/// comments. Offsets are into an array of `Character`s, 1:1 with `masked`.

struct StringLiteral {
    let start: Int
    let end: Int
    /// Lowercased, e.g. "f", "r", "rb"; empty for JS.
    let prefix: String
    /// Escapes decoded, unless the literal is raw.
    let value: String
    /// JS template literal containing `${...}`.
    let interpolated: Bool
}

struct SourceError {
    let message: String
    let line: Int
}

struct ScannedSource {
    let code: [Character]
    var masked: [Character]
    var strings: [Int: StringLiteral] = [:]
    var error: SourceError?

    var maskedString: String { String(masked) }
}

func lineAt(_ code: [Character], _ offset: Int) -> Int {
    var line = 1
    var i = 0
    let end = min(offset, code.count)
    while i < end {
        if code[i] == "\n" { line += 1 }
        i += 1
    }
    return line
}

/// A single backslash escape (the character right after `\`). Shared by Python and JS.
private func decodeEscape(_ next: Character) -> String {
    switch next {
    case "n": return "\n"
    case "t": return "\t"
    case "\\", "'", "\"", "`": return String(next)
    case "\n": return ""
    default: return "\\" + String(next)
    }
}

private let closerFor: [Character: Character] = ["(": ")", "[": "]", "{": "}"]
private let openerFor: [Character: Character] = [")": "(", "]": "[", "}": "{"]

func checkBrackets(_ masked: [Character]) -> SourceError? {
    var stack: [(Character, Int)] = []
    for (i, ch) in masked.enumerated() {
        if closerFor[ch] != nil {
            stack.append((ch, i))
        } else if let opener = openerFor[ch] {
            guard let top = stack.last else {
                return SourceError(
                    message: "There's a \"\(ch)\" on line \(lineAt(masked, i)) with no matching \"\(opener)\" before it.",
                    line: lineAt(masked, i)
                )
            }
            if top.0 != opener {
                return SourceError(
                    message: "The \"\(ch)\" on line \(lineAt(masked, i)) doesn't match the \"\(top.0)\" opened on line \(lineAt(masked, top.1)).",
                    line: lineAt(masked, i)
                )
            }
            stack.removeLast()
        }
    }
    if let top = stack.last {
        return SourceError(
            message: "The \"\(top.0)\" on line \(lineAt(masked, top.1)) is never closed.",
            line: lineAt(masked, top.1)
        )
    }
    return nil
}

private func isIdentChar(_ c: Character) -> Bool { c.isLetter || c.isNumber || c == "_" }

func scanPython(_ source: String) -> ScannedSource {
    let code = Array(source)
    var masked = code
    var strings: [Int: StringLiteral] = [:]
    let n = code.count
    var i = 0
    var error: SourceError?

    while i < n && error == nil {
        let c = code[i]

        if c == "#" {
            var j = i
            while j < n && code[j] != "\n" { masked[j] = " "; j += 1 }
            i = j
            continue
        }

        var prefixLen = 0
        if c != "'" && c != "\"" {
            while prefixLen < 2, i + prefixLen < n, "rRuUbBfF".contains(code[i + prefixLen]) {
                prefixLen += 1
            }
        }
        let quotePos = i + prefixLen
        let precededByIdent = i > 0 && isIdentChar(code[i - 1])
        if !precededByIdent, quotePos < n, code[quotePos] == "'" || code[quotePos] == "\"" {
            let prefix = String(code[i..<quotePos]).lowercased()
            let validPrefixes: Set<String> = ["", "r", "u", "b", "f", "br", "rb", "fr", "rf"]
            if validPrefixes.contains(prefix) {
                let quote = code[quotePos]
                let tripled = quotePos + 2 < n && code[quotePos + 1] == quote && code[quotePos + 2] == quote
                let quoteLen = tripled ? 3 : 1
                let contentStart = quotePos + quoteLen
                let isRaw = prefix.contains("r")

                var k = contentStart
                var value = ""
                var closed = false
                while k < n {
                    if quoteLen == 1 && code[k] == "\n" { break }
                    if code[k] == "\\" && k + 1 < n {
                        let esc = code[k + 1]
                        value += isRaw ? "\\" + String(esc) : decodeEscape(esc)
                        masked[k] = " "
                        masked[k + 1] = esc == "\n" ? "\n" : " "
                        k += 2
                        continue
                    }
                    if code[k] == quote {
                        if quoteLen == 1 {
                            closed = true
                            break
                        } else if k + 2 < n, code[k + 1] == quote, code[k + 2] == quote {
                            closed = true
                            break
                        }
                    }
                    value.append(code[k])
                    masked[k] = code[k] == "\n" ? "\n" : " "
                    k += 1
                }

                if !closed {
                    error = SourceError(
                        message: "The text (string) that starts on line \(lineAt(code, i)) is never closed. Check that it ends with the same quote it starts with.",
                        line: lineAt(code, i)
                    )
                    break
                }

                let literalEnd = k + quoteLen
                // Quotes and prefix are left unmasked, so e.g. `return "x"` still
                // has a non-space character after `return` once the content is blanked.
                strings[i] = StringLiteral(start: i, end: literalEnd, prefix: prefix, value: value, interpolated: false)
                i = literalEnd
                continue
            }
        }

        i += 1
    }

    if error == nil { error = checkBrackets(masked) }
    return ScannedSource(code: code, masked: masked, strings: strings, error: error)
}

func scanJavaScript(_ source: String) -> ScannedSource {
    let code = Array(source)
    var masked = code
    var strings: [Int: StringLiteral] = [:]
    let n = code.count
    var i = 0
    var error: SourceError?

    while i < n && error == nil {
        let c = code[i]

        if c == "/" && i + 1 < n && code[i + 1] == "/" {
            var j = i
            while j < n && code[j] != "\n" { masked[j] = " "; j += 1 }
            i = j
            continue
        }

        if c == "/" && i + 1 < n && code[i + 1] == "*" {
            var j = i + 2
            var closed = false
            while j < n {
                if code[j] == "*" && j + 1 < n && code[j + 1] == "/" {
                    closed = true
                    j += 2
                    break
                }
                j += 1
            }
            if !closed {
                error = SourceError(
                    message: "The comment that starts on line \(lineAt(code, i)) is never closed with */.",
                    line: lineAt(code, i)
                )
                break
            }
            for p in i..<j { masked[p] = code[p] == "\n" ? "\n" : " " }
            i = j
            continue
        }

        if c == "'" || c == "\"" || c == "`" {
            let quote = c
            let isTemplate = quote == "`"
            let literalStart = i
            var k = i + 1
            var value = ""
            var closed = false
            var interpolated = false
            while k < n {
                if !isTemplate && code[k] == "\n" { break }
                if code[k] == "\\" && k + 1 < n {
                    let esc = code[k + 1]
                    value += decodeEscape(esc)
                    masked[k] = " "
                    masked[k + 1] = esc == "\n" ? "\n" : " "
                    k += 2
                    continue
                }
                if isTemplate && code[k] == "$" && k + 1 < n && code[k + 1] == "{" {
                    interpolated = true
                    var depth = 1
                    masked[k] = " "
                    masked[k + 1] = " "
                    var m = k + 2
                    while m < n && depth > 0 {
                        if code[m] == "{" { depth += 1 }
                        else if code[m] == "}" { depth -= 1 }
                        masked[m] = code[m] == "\n" ? "\n" : " "
                        m += 1
                    }
                    k = m
                    continue
                }
                if code[k] == quote {
                    closed = true
                    break
                }
                value.append(code[k])
                masked[k] = code[k] == "\n" ? "\n" : " "
                k += 1
            }
            if !closed {
                error = SourceError(
                    message: "The text (string) that starts on line \(lineAt(code, literalStart)) is never closed. Check that it ends with the same quote it starts with.",
                    line: lineAt(code, literalStart)
                )
                break
            }
            let literalEnd = k + 1
            // Quotes are left unmasked, so e.g. `return "x"` still has a
            // non-space character after `return` once the content is blanked.
            strings[literalStart] = StringLiteral(start: literalStart, end: literalEnd, prefix: "", value: value, interpolated: interpolated)
            i = literalEnd
            continue
        }

        i += 1
    }

    if error == nil { error = checkBrackets(masked) }
    return ScannedSource(code: code, masked: masked, strings: strings, error: error)
}
