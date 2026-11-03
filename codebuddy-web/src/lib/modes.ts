import type { IconName } from "@/components/icons";

/*
 * Single source of truth for the three assistant modes. The sidebar, the
 * mobile tab bar, the welcome page cards and each mode's page header all read
 * from this list, so adding or renaming a mode is a one-file change.
 */
export type ModeId = "learn" | "debug" | "practice";

export interface ModeConfig {
  id: ModeId;
  href: `/${ModeId}`;
  label: string;
  /** Short phrase used under the label in navigation and cards. */
  tagline: string;
  /** One or two sentences shown on the welcome page and in the mode header. */
  description: string;
  /** An example of what a learner might ask in this mode. */
  examplePrompt: string;
  /** What an AI response contains (or will contain, for modes not connected yet). */
  responseOutline: string;
  /**
   * Section headings of the future response, mirroring the fields of the
   * matching `*Response` type in `lib/assistant/types.ts`.
   */
  responseSections: readonly string[];
  /** True when the mode calls the AI. Practice checks answers locally instead. */
  connected: boolean;
  /** Text of the form's submit button. */
  submitLabel: string;
  icon: IconName;
}

export const MODES: readonly ModeConfig[] = [
  {
    id: "learn",
    href: "/learn",
    label: "Learn",
    tagline: "Understand a concept",
    description:
      "Ask about any programming idea and get an explanation pitched at your level, with small examples you can try yourself.",
    examplePrompt: "What is the difference between a list and a tuple?",
    responseOutline:
      "a plain-language explanation, a short code example, key points to remember and follow-up questions to explore.",
    responseSections: ["Explanation", "Code example", "Key points", "Follow-up questions"],
    connected: true,
    submitLabel: "Ask CodeBuddy",
    icon: "learn",
  },
  {
    id: "debug",
    href: "/debug",
    label: "Debug",
    tagline: "Fix an error",
    description:
      "Paste your code and describe what goes wrong. CodeBuddy explains the likely cause, suggests a fix and tells you what it changed and why.",
    examplePrompt: "Why do I get “IndexError: list index out of range”?",
    responseOutline:
      "a diagnosis, an explanation, the corrected code, what changed and why, and next steps.",
    responseSections: ["Diagnosis", "Explanation", "Corrected code", "Changes explained", "Next steps"],
    connected: true,
    submitLabel: "Debug my code",
    icon: "debug",
  },
  {
    id: "practice",
    href: "/practice",
    label: "Practice",
    tagline: "Solve an exercise",
    description:
      "Pick a beginner-friendly exercise, write your own solution and get feedback, with hints whenever you get stuck.",
    examplePrompt: "Write a function that counts the vowels in a word.",
    responseOutline:
      "a verdict on your solution, which requirements and test cases pass, and a hint for what to fix next.",
    responseSections: ["Verdict", "Requirements", "Test cases", "Next hint"],
    connected: false,
    submitLabel: "Check answer",
    icon: "practice",
  },
];

export function getMode(id: ModeId): ModeConfig {
  const mode = MODES.find((m) => m.id === id);
  if (!mode) throw new Error(`Unknown mode: ${id}`);
  return mode;
}
