import Foundation

/// Mirrors `lib/exercises.ts`. Order matters: it's the order shown in the picker.

enum ExerciseDifficulty: String {
    case easy, medium, hard

    var label: String {
        switch self {
        case .easy: "Easy"
        case .medium: "Medium"
        case .hard: "Hard"
        }
    }

    /// Filled bars out of 3, for the difficulty meter.
    var filledBars: Int {
        switch self {
        case .easy: 1
        case .medium: 2
        case .hard: 3
        }
    }
}

struct Exercise: Identifiable {
    let id: String
    let title: String
    let difficulty: ExerciseDifficulty
    let language: ProgrammingLanguage
    let description: String
    let requirements: [String]
    let hints: [String]
    let starterCode: String
}

let EXERCISES: [Exercise] = [
    Exercise(
        id: "greet-user",
        title: "Say hello",
        difficulty: .easy,
        language: .python,
        description: "Write a function that greets a person by name. This practises functions, parameters and joining text together.",
        requirements: [
            "The function is called greet and takes one parameter, name.",
            "It returns the text Hello, <name>! (for example greet(\"Ada\") returns \"Hello, Ada!\").",
            "It returns the value instead of printing it.",
        ],
        hints: [
            "A function that gives a value back uses the return keyword.",
            "An f-string lets you put a variable inside text: f\"Hi {name}\".",
        ],
        starterCode: """
        def greet(name):
            # Your code here
            pass


        print(greet("Ada"))  # Hello, Ada!
        """
    ),
    Exercise(
        id: "sum-list",
        title: "Add up a list",
        difficulty: .easy,
        language: .python,
        description: "Calculate the total of a list of numbers without using the built-in sum() function. This practises loops and variables.",
        requirements: [
            "The function is called total and takes a list of numbers.",
            "It returns the sum of all numbers in the list.",
            "An empty list should return 0.",
            "Do not use the built-in sum() function.",
        ],
        hints: [
            "Start with a variable that holds 0 before the loop.",
            "Use for number in numbers: to visit each value one at a time.",
            "Inside the loop, add the current number to your running total.",
        ],
        starterCode: """
        def total(numbers):
            # Your code here
            pass


        print(total([4, 8, 15]))  # 27
        print(total([]))          # 0
        """
    ),
    Exercise(
        id: "fizzbuzz",
        title: "FizzBuzz",
        difficulty: .medium,
        language: .javascript,
        description: "A classic exercise for practising conditions and loops: print the numbers from 1 to 15, replacing some of them with words.",
        requirements: [
            "Print each number from 1 to 15 on its own line.",
            "For multiples of 3, print Fizz instead of the number.",
            "For multiples of 5, print Buzz instead of the number.",
            "For multiples of both 3 and 5, print FizzBuzz.",
        ],
        hints: [
            "The remainder operator % tells you whether a number divides evenly: 9 % 3 === 0.",
            "Check the \u{201c}both 3 and 5\u{201d} case first, otherwise Fizz or Buzz will win too early.",
            "Use if / else if / else so that only one line is printed per number.",
        ],
        starterCode: """
        for (let i = 1; i <= 15; i++) {
          // Your code here
        }
        """
    ),
    Exercise(
        id: "count-vowels",
        title: "Count the vowels",
        difficulty: .medium,
        language: .python,
        description: "Count how many vowels appear in a piece of text. This practises strings, loops and membership checks.",
        requirements: [
            "The function is called count_vowels and takes a string, text.",
            "It returns how many of the letters a, e, i, o, u appear in the text.",
            "Uppercase vowels count too: count_vowels(\"Apple\") returns 2.",
        ],
        hints: [
            "Strings can be looped over one character at a time, just like lists.",
            "text.lower() makes uppercase letters lowercase, so you only need to check one case.",
            "The in keyword checks membership: \"e\" in \"aeiou\" is True.",
        ],
        starterCode: """
        def count_vowels(text):
            # Your code here
            pass


        print(count_vowels("Apple"))        # 2
        print(count_vowels("CodeBuddy"))    # 3
        """
    ),
    Exercise(
        id: "largest-number",
        title: "Find the biggest",
        difficulty: .medium,
        language: .python,
        description: "Find the biggest number in a list without using the built-in max() function. This practises loops, if statements and choosing a starting value.",
        requirements: [
            "The function is called largest and takes a list of numbers.",
            "It returns the biggest number in the list (for example largest([3, 9, 4]) returns 9).",
            "It works when every number is negative: largest([-5, -2, -8]) returns -2.",
            "The list always has at least one number.",
            "Do not use the built-in max() function.",
        ],
        hints: [
            "Keep a variable for the biggest number seen so far, and visit each number with a for loop.",
            "Inside the loop, compare: is this number bigger than the biggest so far? If it is, remember it instead.",
            "Be careful with the starting value: 0 is wrong when every number is negative. Start with the first number, numbers[0].",
        ],
        starterCode: """
        def largest(numbers):
            # Your code here
            pass


        print(largest([3, 9, 4]))     # 9
        print(largest([-5, -2, -8]))  # -2
        """
    ),
]

func getExercise(_ id: String) -> Exercise? {
    EXERCISES.first { $0.id == id }
}
