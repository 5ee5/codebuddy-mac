import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/assistant/validation";
import { EXERCISES, getExercise, type Exercise } from "@/lib/exercises";
import { CHECKERS, checkAnswer } from "@/lib/practice/check";
import type { PracticeCheck } from "@/lib/practice/types";

const exercise = (id: string): Exercise => getExercise(id)!;
const check = (id: string, code: string) => checkAnswer(exercise(id), code, new Date("2026-10-25T10:00:00Z"));

const checkStatus = (result: PracticeCheck, id: string) => result.checks.find((c) => c.id === id)?.status;
const failedTests = (result: PracticeCheck) => result.tests.filter((t) => t.passed === false);

describe("checkAnswer basics", () => {
  it("has a checker for every exercise", () => {
    for (const ex of EXERCISES) expect(CHECKERS[ex.id], ex.id).toBeTypeOf("function");
  });

  it.each(EXERCISES.map((ex) => [ex.id]))("marks the unchanged starter code of %s as incorrect", (id) => {
    const result = check(id, exercise(id).starterCode);
    expect(result.verdict).toBe("incorrect");
    expect(result.hint).toBeTruthy();
  });

  it.each(EXERCISES.map((ex) => [ex.id]))("handles an empty submission for %s", (id) => {
    for (const code of ["", "   \n\t "]) {
      const result = check(id, code);
      expect(result.verdict).toBe("incorrect");
      expect(result.checks[0]).toMatchObject({ id: "not-empty", status: "fail" });
    }
  });

  it("rejects code over the length limit without scanning it", () => {
    const result = check("greet-user", "#".repeat(LIMITS.solutionMax + 1));
    expect(result.verdict).toBe("incorrect");
    expect(result.checks[0].id).toBe("length");
  });

  it("is unverified, never correct, for an exercise without a checker", () => {
    const unknown: Exercise = { ...exercise("greet-user"), id: "not-a-real-exercise" };
    expect(checkAnswer(unknown, "def greet(name):\n    return name").verdict).toBe("unverified");
  });

  it("records the checked code and time", () => {
    const result = check("greet-user", "x = 1");
    expect(result).toMatchObject({ checkedCode: "x = 1", checkedAt: "2026-10-25T10:00:00.000Z" });
  });

  it.each([
    ["an unclosed string", "greet-user", 'def greet(name):\n    return "Hello, ', 2],
    ["an unclosed bracket", "sum-list", "def total(numbers):\n    result = (0\n    return result", 2],
    ["a stray closing bracket", "count-vowels", "def count_vowels(text):\n    return 0)", 2],
    ["an unclosed comment", "fizzbuzz", "for (let i = 1; i <= 15; i++) {\n  /* console.log(i)\n}", 2],
    ["an unclosed template", "fizzbuzz", "console.log(`Fizz", 1],
  ])("reports %s with its line number", (_label, id, code, line) => {
    const result = check(id, code);
    expect(result.verdict).toBe("incorrect");
    expect(result.checks[0]).toMatchObject({ id: "readable", status: "fail" });
    expect(result.checks[0].detail).toContain(`line ${line}`);
    expect(result.summary).toMatch(/couldn’t read/);
  });

  it("copes with pathological input quickly", () => {
    const deep = `def total(numbers):\n    return ${"(".repeat(3000)}0${")".repeat(3000)}`;
    const fizz = `for (let i = 1; i <= 15; i++) if (${"(".repeat(3000)}i${")".repeat(3000)}) console.log("Fizz");`;
    const started = Date.now();
    expect(check("sum-list", deep).verdict).not.toBe("correct");
    expect(check("fizzbuzz", fizz).verdict).not.toBe("correct");
    expect(check("greet-user", "def greet(name):\n" + '    x = "a"\n'.repeat(800) + "    return x").verdict).toBe(
      "partial",
    );
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------- greet ----

describe("greet-user", () => {
  it.each([
    ["an f-string", 'def greet(name):\n    return f"Hello, {name}!"'],
    ["concatenation", "def greet(name):\n    return 'Hello, ' + name + '!'"],
    ["a variable first", 'def greet(name):\n    """Say hi."""\n    message = f"Hello, {name}!"\n    return message'],
    ["+= steps", 'def greet(name):\n    text = "Hello, "\n    text += name\n    text += "!"\n    return text'],
    ["str() and parentheses", 'def greet(name):\n    return ("Hello, " + str(name)) + "!"'],
    ["a one-line def and a print call", 'def greet(name): return f"Hello, {name}!"\n\nprint(greet("Ada"))'],
    ["a different parameter name", 'def greet(person):\n    return f"Hello, {person}!"'],
    ["an unused literal constant", 'GREETING = "Hello"\nNAMES = ["Ada", 2]\n\ndef greet(name):\n    return f"Hello, {name}!"'],
  ])("accepts %s", (_label, code) => {
    const result = check("greet-user", code);
    expect(result.verdict).toBe("correct");
    expect(result.tests).toHaveLength(3);
    expect(result.tests.every((t) => t.passed)).toBe(true);
    expect(result.hint).toBeNull();
  });

  it("flags printing instead of returning as a blocking failure", () => {
    const result = check("greet-user", 'def greet(name):\n    print(f"Hello, {name}!")');
    expect(result.verdict).toBe("incorrect");
    expect(result.checks.find((c) => c.id === "returns")).toMatchObject({ status: "fail" });
    expect(result.hint).toMatch(/print only shows/);
  });

  it("is partial when it prints as well as returns", () => {
    const result = check("greet-user", 'def greet(name):\n    print(name)\n    return f"Hello, {name}!"');
    expect(result.verdict).toBe("partial");
    expect(checkStatus(result, "no-print")).toBe("fail");
    expect(result.tests.every((t) => t.passed)).toBe(true);
  });

  it.each([
    ["a missing exclamation mark", 'def greet(name):\n    return f"Hello, {name}"', '"Hello, Ada"'],
    ["a missing comma", 'def greet(name):\n    return "Hello " + name + "!"', '"Hello Ada!"'],
    ["a lowercase greeting", 'def greet(name):\n    return f"hello, {name}!"', '"hello, Ada!"'],
  ])("shows the actual text for %s", (_label, code, actual) => {
    const result = check("greet-user", code);
    expect(result.verdict).toBe("partial");
    expect(result.tests[0]).toMatchObject({ expected: '"Hello, Ada!"', actual, passed: false });
    expect(result.hint).toBeTruthy();
  });

  it("explains a capitalisation mismatch", () => {
    expect(check("greet-user", 'def greet(name):\n    return f"hello, {name}!"').hint).toMatch(/capital/);
  });

  it.each([
    ["the wrong name", 'def hello(name):\n    return f"Hello, {name}!"', /found def hello/],
    ["no function", 'print("Hello, Ada!")', /couldn’t find def greet/],
    ["two parameters", 'def greet(first, last):\n    return f"Hello, {first}!"', /2 parameters/],
    ["no parameters", 'def greet():\n    return "Hello, Ada!"', /0 parameters/],
    ["*args", 'def greet(*names):\n    return "Hello!"', /unusual parameter/],
    ["only a docstring", 'def greet(name):\n    """TODO"""\n    pass', /only contains pass/],
    ["a bare return", "def greet(name):\n    x = 1\n    return", /on its own gives back None/],
  ])("is incorrect with %s", (_label, code, detail) => {
    const result = check("greet-user", code);
    expect(result.verdict).toBe("incorrect");
    expect(result.checks.find((c) => c.status === "fail")?.detail).toMatch(detail);
    expect(result.tests).toEqual([]);
  });

  it("isn't fooled by keywords inside comments or strings", () => {
    const code = '# def greet(name):\n#     return f"Hello, {name}!"\nx = "def greet(name): return name"';
    expect(check("greet-user", code).verdict).toBe("incorrect");
  });

  it("uses the last definition when greet is defined twice", () => {
    const code = 'def greet(name):\n    return f"Hello, {name}!"\n\ndef greet(name):\n    return "Hi"';
    const result = check("greet-user", code);
    expect(result.verdict).toBe("partial");
    expect(checkStatus(result, "defined-once")).toBe("fail");
  });

  it.each([
    ["a condition", 'def greet(name):\n    if name:\n        return f"Hello, {name}!"\n    return "Hello!"'],
    ["a method call", 'def greet(name):\n    return "Hello, {}!".format(name)'],
    ["% formatting", 'def greet(name):\n    return "Hello, %s!" % name'],
    ["a global", 'GREETING = "Hello"\n\ndef greet(name):\n    return f"{GREETING}, {name}!"'],
    ["a lambda", 'greet = lambda name: f"Hello, {name}!"'],
    ["a later rebinding", 'def greet(name):\n    return f"Hello, {name}!"\n\ngreet = str'],
    ["broken top-level code", 'def greet(name):\n    return f"Hello, {name}!"\n\nfoo bar'],
    ["an import", 'import os\n\ndef greet(name):\n    return f"Hello, {name}!"'],
    ["another function", 'def greet(name):\n    return f"Hello, {name}!"\n\ndef main():\n    print(greet("Ada"))'],
  ])("is unverified, not correct or incorrect, with %s", (_label, code) => {
    const result = check("greet-user", code);
    expect(result.verdict).toBe("unverified");
    expect(result.tests.every((t) => t.actual === null && t.passed === null)).toBe(true);
    expect(result.tests[0].expected).toBe('"Hello, Ada!"');
  });
});

// -------------------------------------------------------------- sum-list ----

describe("sum-list", () => {
  it.each([
    ["the pattern from the hints", "def total(numbers):\n    result = 0\n    for number in numbers:\n        result += number\n    return result"],
    ["acc = acc + n", "def total(numbers):\n    s = 0\n    for n in numbers:\n        s = s + n\n    return s"],
    ["acc = n + acc", "def total(nums):\n    s = 0\n    for n in nums:\n        s = n + s\n    return s"],
    ["an index loop", "def total(numbers):\n    t = 0\n    for i in range(len(numbers)):\n        t += numbers[i]\n    return t"],
    ["a float start", "def total(numbers):\n    t = 0.0\n    for n in numbers:\n        t += n\n    return t"],
    ["a sum variable name", "def total(numbers):\n    sum = 0\n    for n in numbers:\n        sum += n\n    return sum\n\nprint(total([4, 8, 15]))  # 27"],
    ["the starter prints kept", "def total(numbers):\n    # add up\n    result = 0\n\n    for number in numbers:\n        result += number\n\n    return result\n\n\nprint(total([4, 8, 15]))  # 27\nprint(total([]))          # 0\n"],
  ])("accepts %s", (_label, code) => {
    const result = check("sum-list", code);
    expect(result.verdict).toBe("correct");
    expect(result.tests).toHaveLength(4);
  });

  it("shows 27.0 for a float accumulator but still passes", () => {
    const result = check("sum-list", "def total(numbers):\n    t = 0.0\n    for n in numbers:\n        t += n\n    return t");
    expect(result.tests[0]).toMatchObject({ actual: "27.0", passed: true });
  });

  it("fails the sum() requirement even though sum() would give the right answer", () => {
    const result = check("sum-list", "def total(numbers):\n    return sum(numbers)");
    expect(result.verdict).toBe("partial");
    expect(result.checks.find((c) => c.id === "no-sum")).toMatchObject({ status: "fail", detail: "Line 2 calls sum()." });
    expect(result.tests.every((t) => t.passed === null)).toBe(true);
  });

  it("allows sum( inside comments and strings", () => {
    const code = '# Not allowed: sum(numbers)\ndef total(numbers):\n    """Like sum() but by hand."""\n    t = 0\n    for n in numbers:\n        t += n\n    return t';
    const result = check("sum-list", code);
    expect(checkStatus(result, "no-sum")).toBe("pass");
    expect(result.verdict).toBe("correct");
  });

  it("catches a return inside the loop and shows what it returns", () => {
    const result = check("sum-list", "def total(numbers):\n    t = 0\n    for n in numbers:\n        t += n\n        return t");
    expect(result.verdict).toBe("partial");
    expect(result.checks.find((c) => c.id === "return-after-loop")).toMatchObject({ status: "fail" });
    expect(result.tests[0]).toMatchObject({ actual: "4", passed: false });
    expect(result.tests[1]).toMatchObject({ actual: "None", passed: false });
  });

  it.each([
    ["starting at 1", "def total(numbers):\n    t = 1\n    for n in numbers:\n        t += n\n    return t", "28", "1"],
    ["replacing instead of adding", "def total(numbers):\n    t = 0\n    for n in numbers:\n        t = n\n    return t", "15", "0"],
    ["counting instead of adding", "def total(numbers):\n    t = 0\n    for n in numbers:\n        t += 1\n    return t", "3", "0"],
  ])("models the mistake of %s", (_label, code, first, empty) => {
    const result = check("sum-list", code);
    expect(result.verdict).toBe("partial");
    expect(result.tests[0].actual).toBe(first);
    expect(result.tests[1].actual).toBe(empty);
    expect(result.hint).toBeTruthy();
  });

  it("hints at the starting value when only the empty list fails", () => {
    const result = check("sum-list", "def total(numbers):\n    t = 1\n    for n in numbers:\n        t += n\n    return t");
    expect(result.hint).toMatch(/empty list/);
  });

  it.each([
    ["a while loop", "def total(numbers):\n    t = 0\n    i = 0\n    while i < len(numbers):\n        t += numbers[i]\n        i += 1\n    return t"],
    ["recursion", "def total(numbers):\n    if not numbers:\n        return 0\n    return numbers[0] + total(numbers[1:])"],
    ["reduce", "from functools import reduce\n\ndef total(numbers):\n    return reduce(lambda a, b: a + b, numbers, 0)"],
  ])("is unverified with %s", (_label, code) => {
    expect(check("sum-list", code).verdict).toBe("unverified");
  });

  it.each([
    ["mixed tabs and spaces", "def total(numbers):\n    t = 0\n\tfor n in numbers:\n\t\tt += n\n    return t"],
    ["an inconsistent dedent", "def total(numbers):\n    t = 0\n    for n in numbers:\n        t += n\n  return t"],
  ])("doesn't trust code with %s", (_label, code) => {
    expect(check("sum-list", code).verdict).toBe("unverified");
  });

  it("explains a body that isn't indented", () => {
    const result = check("sum-list", "def total(numbers):\nreturn 0");
    expect(result.verdict).toBe("incorrect");
    expect(result.checks.find((c) => c.id === "has-code")?.detail).toMatch(/must be indented/);
  });

  it("is incorrect when total is missing", () => {
    expect(check("sum-list", "def sum_list(numbers):\n    return 0").verdict).toBe("incorrect");
  });
});

// ---------------------------------------------------------- count-vowels ----

describe("count-vowels", () => {
  it.each([
    ["a loop over text.lower()", 'def count_vowels(text):\n    count = 0\n    for ch in text.lower():\n        if ch in "aeiou":\n            count += 1\n    return count'],
    ["lowering each character", 'def count_vowels(text):\n    count = 0\n    for ch in text:\n        if ch.lower() in "aeiou":\n            count = count + 1\n    return count'],
    ["both cases listed", 'def count_vowels(text):\n    n = 0\n    for c in text:\n        if c in "aeiouAEIOU": n += 1\n    return n'],
    ["a vowels variable and a list", 'def count_vowels(text):\n    vowels = ["a", "e", "i", "o", "u"]\n    text = text.lower()\n    count = 0\n    for letter in text:\n        if letter in vowels:\n            count += 1\n    return count'],
    ["a generator with sum", 'def count_vowels(text):\n    return sum(1 for c in text.lower() if c in "aeiou")'],
    ["a list comprehension with len", 'def count_vowels(text):\n    return len([c for c in text.lower() if c in ("a", "e", "i", "o", "u")])'],
    ["an uppercase approach", 'def count_vowels(text):\n    return sum([1 for c in text.upper() if c in "AEIOU"])'],
  ])("accepts %s", (_label, code) => {
    const result = check("count-vowels", code);
    expect(result.verdict).toBe("correct");
    expect(result.tests).toHaveLength(6);
  });

  it("accepts a constant defined once before the function", () => {
    const code = 'VOWELS = "aeiou"\n\ndef count_vowels(text):\n    return sum(1 for c in text.lower() if c in VOWELS)';
    expect(check("count-vowels", code).verdict).toBe("correct");
  });

  it("catches missing uppercase handling", () => {
    const result = check("count-vowels", 'def count_vowels(text):\n    count = 0\n    for ch in text:\n        if ch in "aeiou":\n            count += 1\n    return count');
    expect(result.verdict).toBe("partial");
    expect(result.tests[0]).toMatchObject({ call: 'count_vowels("Apple")', expected: "2", actual: "1", passed: false });
    expect(result.hint).toMatch(/Uppercase/);
  });

  it("catches y counted as a vowel", () => {
    const result = check("count-vowels", 'def count_vowels(text):\n    return sum(1 for c in text.lower() if c in "aeiouy")');
    expect(result.verdict).toBe("partial");
    expect(result.tests.find((t) => t.call.includes("rhythm"))).toMatchObject({ actual: "1", passed: false });
    expect(result.hint).toMatch(/also counts y/);
  });

  it("catches a missing vowel", () => {
    const result = check("count-vowels", 'def count_vowels(text):\n    return sum(1 for c in text.lower() if c in "aeio")');
    expect(result.hint).toMatch(/doesn’t count u/);
  });

  it.each([
    ["str.count", 'def count_vowels(text):\n    return sum(text.lower().count(v) for v in "aeiou")'],
    ["a regex", 'import re\n\ndef count_vowels(text):\n    return len(re.findall("[aeiou]", text, re.I))'],
    ["a constant assigned twice", 'VOWELS = "xyz"\nVOWELS = "aeiou"\n\ndef count_vowels(text):\n    return sum(1 for c in text.casefold() if c in VOWELS)'],
    ["a counter returned from elsewhere", 'def count_vowels(text):\n    count = 0\n    for ch in text.lower():\n        if ch in "aeiou":\n            count += 1\n    return len(text)'],
  ])("is unverified with %s", (_label, code) => {
    expect(check("count-vowels", code).verdict).toBe("unverified");
  });

  it("is incorrect when it prints the count", () => {
    const result = check("count-vowels", 'def count_vowels(text):\n    print(len([c for c in text if c in "aeiou"]))');
    expect(result.verdict).toBe("incorrect");
  });
});

// -------------------------------------------------------------- fizzbuzz ----

describe("fizzbuzz", () => {
  const chain = (cond15: string, body = "") => `for (let i = 1; i <= 15; i++) {
  if (${cond15}) {
    console.log("FizzBuzz");
  } else if (i % 3 === 0) {
    console.log("Fizz");
  } else if (i % 5 === 0) {
    console.log("Buzz");
  } else {
    console.log(i);
  }${body}
}
`;

  it.each([
    ["the classic chain", chain("i % 3 === 0 && i % 5 === 0")],
    ["% 15", chain("i % 15 === 0")],
    [
      "no semicolons, one statement per line",
      'for (let i = 1; i <= 15; i++) {\n  if (i % 15 === 0) console.log("FizzBuzz")\n  else if (i % 3 === 0) console.log("Fizz")\n  else if (i % 5 === 0) console.log("Buzz")\n  else console.log(i)\n}',
    ],
    ["parenthesised loose checks", chain("(i % 3 == 0) && (i % 5 == 0)")],
    ["negation", chain("!(i % 15)")],
    [
      "no braces and i < 16",
      'for (var i = 1; i < 16; i += 1)\n  if (i % 15 === 0) console.log("FizzBuzz");\n  else if (i % 3 === 0) console.log("Fizz");\n  else if (i % 5 === 0) console.log("Buzz");\n  else console.log(i);',
    ],
  ])("accepts %s", (_label, code) => {
    const result = check("fizzbuzz", code);
    expect(result.verdict).toBe("correct");
    expect(result.tests).toHaveLength(5);
  });

  it("catches checking Fizz before FizzBuzz", () => {
    const code = `for (let i = 1; i <= 15; i++) {
  if (i % 3 === 0) console.log("Fizz");
  else if (i % 5 === 0) console.log("Buzz");
  else if (i % 15 === 0) console.log("FizzBuzz");
  else console.log(i);
}`;
    const result = check("fizzbuzz", code);
    expect(result.verdict).toBe("partial");
    expect(failedTests(result).map((t) => t.label)).toEqual(["Multiples of 3 and 5 print FizzBuzz"]);
    expect(failedTests(result)[0].actual).toBe("15 printed Fizz");
    expect(result.hint).toMatch(/tested first/);
  });

  it("catches separate ifs that print two lines", () => {
    const code = `for (let i = 1; i <= 15; i++) {
  if (i % 3 === 0) console.log("Fizz");
  if (i % 5 === 0) console.log("Buzz");
  if (i % 15 === 0) console.log("FizzBuzz");
  console.log(i);
}`;
    const result = check("fizzbuzz", code);
    expect(result.verdict).toBe("partial");
    expect(result.tests[0]).toMatchObject({ passed: false, actual: "3 printed 2 lines: Fizz, 3" });
    expect(result.hint).toMatch(/else if/);
  });

  it("catches a loop that stops at 14", () => {
    const result = check("fizzbuzz", chain("i % 15 === 0").replace("i <= 15", "i < 15"));
    expect(result.verdict).toBe("partial");
    expect(result.tests[0].actual).toBe("numbers 1 to 14");
    expect(result.tests.find((t) => t.label.includes("FizzBuzz"))?.actual).toBe("15 printed nothing");
  });

  it.each([["Fizzbuzz"], ["fizz"], ["Fizz Buzz"]])("flags the near-miss spelling %s", (word) => {
    const result = check("fizzbuzz", chain("i % 15 === 0").replace('"FizzBuzz"', `"${word}"`));
    expect(result.verdict).toBe("partial");
    expect(result.checks.find((c) => c.id === "words")).toMatchObject({ status: "fail" });
    expect(result.checks.find((c) => c.id === "words")?.detail).toContain(word);
  });

  it("is incorrect without console.log", () => {
    const result = check("fizzbuzz", 'for (let i = 1; i <= 15; i++) {\n  // console.log("Fizz")\n  const x = "console.log(i)";\n}');
    expect(result.verdict).toBe("incorrect");
    expect(result.checks[0]).toMatchObject({ id: "prints", status: "fail" });
  });

  it("is partial when only numbers are printed", () => {
    const result = check("fizzbuzz", "for (let i = 1; i <= 15; i++) {\n  console.log(i);\n}");
    expect(result.verdict).toBe("partial");
    expect(result.checks.find((c) => c.id === "words")?.detail).toMatch(/Fizz or Buzz/);
  });

  it.each([
    [
      "string building",
      'for (let i = 1; i <= 15; i++) {\n  let out = "";\n  if (i % 3 === 0) out += "Fizz";\n  if (i % 5 === 0) out += "Buzz";\n  console.log(out || i);\n}',
    ],
    ["a while loop", 'let i = 1;\nwhile (i <= 15) {\n  console.log(i % 15 === 0 ? "FizzBuzz" : i % 3 === 0 ? "Fizz" : i % 5 === 0 ? "Buzz" : i);\n  i++;\n}'],
    ["a template literal", chain("i % 15 === 0").replace("console.log(i)", "console.log(`${i}`)")],
    ["a huge loop", chain("i % 15 === 0").replace("i <= 15", "i <= 1000000")],
    [
      "a missing semicolon before else on one line",
      'for (let i = 1; i <= 15; i++) if (i % 15 === 0) console.log("FizzBuzz") else if (i % 3 === 0) console.log("Fizz"); else if (i % 5 === 0) console.log("Buzz"); else console.log(i);',
    ],
  ])("is unverified with %s", (_label, code) => {
    const result = check("fizzbuzz", code);
    expect(result.verdict).toBe("unverified");
    expect(result.tests.every((t) => t.passed === null)).toBe(true);
  });
});

// -------------------------------------------------------- largest-number ----

describe("largest-number", () => {
  it.each([
    ["the pattern from the hints", "def largest(numbers):\n    biggest = numbers[0]\n    for number in numbers:\n        if number > biggest:\n            biggest = number\n    return biggest"],
    ["skipping the first number", "def largest(numbers):\n    biggest = numbers[0]\n    for n in numbers[1:]:\n        if n > biggest:\n            biggest = n\n    return biggest"],
    ["an index loop from 1", "def largest(numbers):\n    b = numbers[0]\n    for i in range(1, len(numbers)):\n        if numbers[i] > b:\n            b = numbers[i]\n    return b"],
    ["the comparison written the other way", "def largest(numbers):\n    b = numbers[0]\n    for n in numbers:\n        if b < n:\n            b = n\n    return b"],
    [">= and brackets", "def largest(numbers):\n    b = numbers[0]\n    for n in numbers:\n        if (n >= b):\n            b = n\n    return b"],
    ["a one-line if", "def largest(numbers):\n    b = numbers[0]\n    for n in numbers:\n        if n > b: b = n\n    return b"],
    ["float('-inf')", "def largest(numbers):\n    b = float('-inf')\n    for n in numbers:\n        if n > b:\n            b = n\n    return b"],
    ["the starter prints kept", "def largest(numbers):\n    # biggest so far\n    biggest = numbers[0]\n\n    for number in numbers:\n        if number > biggest:\n            biggest = number\n\n    return biggest\n\n\nprint(largest([3, 9, 4]))     # 9\nprint(largest([-5, -2, -8]))  # -2\n"],
  ])("accepts %s", (_label, code) => {
    const result = check("largest-number", code);
    expect(result.verdict).toBe("correct");
    expect(result.tests).toHaveLength(4);
  });

  it("fails the max() requirement even though max() would give the right answer", () => {
    const result = check("largest-number", "def largest(numbers):\n    return max(numbers)");
    expect(result.verdict).toBe("partial");
    expect(result.checks.find((c) => c.id === "no-max")).toMatchObject({ status: "fail", detail: "Line 2 calls max()." });
    expect(result.tests.every((t) => t.passed === null)).toBe(true);
  });

  it("allows max( inside comments and strings", () => {
    const code = '# Not allowed: max(numbers)\ndef largest(numbers):\n    """Like max() but by hand."""\n    b = numbers[0]\n    for n in numbers:\n        if n > b:\n            b = n\n    return b';
    const result = check("largest-number", code);
    expect(checkStatus(result, "no-max")).toBe("pass");
    expect(result.verdict).toBe("correct");
  });

  it("models starting at 0, which only fails for negative numbers", () => {
    const result = check("largest-number", "def largest(numbers):\n    b = 0\n    for n in numbers:\n        if n > b:\n            b = n\n    return b");
    expect(result.verdict).toBe("partial");
    expect(failedTests(result)).toEqual([expect.objectContaining({ call: "largest([-5, -2, -8])", actual: "0" })]);
    expect(result.hint).toMatch(/every number is negative/);
  });

  it("shows a float starting value the way Python would", () => {
    const result = check("largest-number", "def largest(numbers):\n    b = 0.0\n    for n in numbers:\n        if n > b:\n            b = n\n    return b");
    expect(result.tests[0]).toMatchObject({ actual: "9", passed: true });
    expect(result.tests[1]).toMatchObject({ actual: "0.0", passed: false });
  });

  it.each([
    ["comparing the wrong way", "def largest(numbers):\n    b = numbers[0]\n    for n in numbers:\n        if n < b:\n            b = n\n    return b", "3", "-8"],
    ["replacing without comparing", "def largest(numbers):\n    b = numbers[0]\n    for n in numbers:\n        b = n\n    return b", "4", "-8"],
    ["float('inf') as the start", "def largest(numbers):\n    b = float('inf')\n    for n in numbers:\n        if n > b:\n            b = n\n    return b", "inf", "inf"],
  ])("models the mistake of %s", (_label, code, first, negatives) => {
    const result = check("largest-number", code);
    expect(result.verdict).toBe("partial");
    expect(result.tests[0].actual).toBe(first);
    expect(result.tests[1].actual).toBe(negatives);
    expect(result.hint).toMatch(/by hand/);
  });

  it("catches a return inside the loop and shows what it returns", () => {
    const result = check("largest-number", "def largest(numbers):\n    b = numbers[0]\n    for n in numbers:\n        if n > b:\n            b = n\n        return b");
    expect(result.verdict).toBe("partial");
    expect(result.checks.find((c) => c.id === "return-after-loop")).toMatchObject({ status: "fail" });
    expect(result.tests[0]).toMatchObject({ actual: "3", passed: false });
    expect(result.hint).toMatch(/Indentation/);
  });

  it("returns None when skipping the first number with no return after the loop", () => {
    const result = check("largest-number", "def largest(numbers):\n    b = numbers[0]\n    for n in numbers[1:]:\n        if n > b:\n            b = n\n        return b");
    expect(result.tests[2]).toMatchObject({ call: "largest([7])", actual: "None", passed: false });
  });

  it.each([
    ["a while loop", "def largest(numbers):\n    b = numbers[0]\n    i = 1\n    while i < len(numbers):\n        if numbers[i] > b:\n            b = numbers[i]\n        i += 1\n    return b"],
    ["sorting", "def largest(numbers):\n    return sorted(numbers)[-1]"],
    ["an else branch", "def largest(numbers):\n    b = numbers[0]\n    for n in numbers:\n        if n > b:\n            b = n\n        else:\n            pass\n    return b"],
  ])("is unverified with %s", (_label, code) => {
    expect(check("largest-number", code).verdict).toBe("unverified");
  });

  it("is incorrect when largest is missing", () => {
    expect(check("largest-number", "def biggest(numbers):\n    return 0").verdict).toBe("incorrect");
  });
});

// ------------------------------------------------------- constant returns ----

describe("constant returns", () => {
  it.each([
    ["count-vowels", "def count_vowels(text): return 0", "0"],
    ["count-vowels", "def count_vowels(text):\n    return 0", "0"],
    ["greet-user", "def greet(name):\n    return 0", "0"],
    ["sum-list", "def total(numbers):\n    return 0", "0"],
    ["sum-list", "def total(numbers):\n    return -1", "-1"],
    ["sum-list", "def total(numbers):\n    return 0.0", "0.0"],
    ["greet-user", "def greet(name):\n    return None", "None"],
    ["greet-user", 'def greet(name):\n    return "Hello, Ada!"', '"Hello, Ada!"'],
    ["count-vowels", 'def count_vowels(text):\n    """Count them."""\n    return ""', '""'],
    ["sum-list", "def total(numbers):\n    return 27\n\nprint(total([4, 8, 15]))  # 27", "27"],
  ])("%s: %j is incorrect, with its actual value in every test", (id, code, actual) => {
    const result = check(id, code);
    expect(result.verdict).toBe("incorrect");
    expect(result.checks.find((c) => c.id === "uses-input")).toMatchObject({ status: "fail", blocking: true });
    expect(result.checks.find((c) => c.id === "uses-input")?.detail).toContain(`always returns ${actual}`);
    expect(result.tests.length).toBeGreaterThan(0);
    expect(result.tests.every((t) => t.actual === actual && t.passed !== null)).toBe(true);
    expect(result.hint).toMatch(/needs to use its parameter/);
  });

  it("still marks the tests a constant happens to satisfy as passed", () => {
    const vowels = check("count-vowels", "def count_vowels(text): return 0");
    expect(vowels.tests.filter((t) => t.passed).map((t) => t.call)).toEqual([
      'count_vowels("")',
      'count_vowels("rhythm")',
    ]);
    const sum = check("sum-list", "def total(numbers):\n    return 0");
    expect(sum.tests.filter((t) => t.passed).map((t) => t.call)).toEqual(["total([])"]);
    const greet = check("greet-user", 'def greet(name):\n    return "Hello, Ada!"');
    expect(greet.tests.map((t) => t.passed)).toEqual([true, false, false]);
  });

  it("doesn't add the input check to solutions that use their input", () => {
    for (const [id, code] of [
      ["greet-user", 'def greet(name):\n    return f"Hello, {name}!"'],
      ["sum-list", "def total(numbers):\n    t = 0\n    for n in numbers:\n        t += n\n    return t"],
      ["count-vowels", 'def count_vowels(text):\n    return sum(1 for c in text.lower() if c in "aeiou")'],
    ]) {
      const result = check(id, code);
      expect(result.verdict).toBe("correct");
      expect(result.checks.some((c) => c.id === "uses-input")).toBe(false);
    }
  });

  it.each([
    ["an expression", "count-vowels", "def count_vowels(text):\n    return len(text) * 0"],
    ["a parenthesised literal", "sum-list", "def total(numbers):\n    return (0)"],
    ["a boolean", "count-vowels", "def count_vowels(text):\n    return False"],
    ["a byte string", "greet-user", 'def greet(name):\n    return b"Hello"'],
    ["unsupported top-level code", "sum-list", "import math\n\ndef total(numbers):\n    return 0"],
    ["another statement first", "greet-user", 'def greet(name):\n    x = name\n    return 0'],
  ])("stays unverified, not incorrect, with %s", (_label, id, code) => {
    const result = check(id, code);
    expect(result.verdict).toBe("unverified");
    expect(result.checks.some((c) => c.id === "uses-input")).toBe(false);
  });
});
