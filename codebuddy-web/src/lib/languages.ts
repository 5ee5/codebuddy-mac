import type { ProgrammingLanguage } from "@/lib/assistant/types";

export const LANGUAGE_LABELS: Record<ProgrammingLanguage, string> = {
  python: "Python",
  javascript: "JavaScript",
  java: "Java",
  cpp: "C++",
  csharp: "C#",
  other: "Other",
};

export const LANGUAGES = Object.keys(LANGUAGE_LABELS) as ProgrammingLanguage[];

/** File extension used for editor captions such as "main.py". */
export const LANGUAGE_EXTENSIONS: Record<ProgrammingLanguage, string> = {
  python: "py",
  javascript: "js",
  java: "java",
  cpp: "cpp",
  csharp: "cs",
  other: "txt",
};
