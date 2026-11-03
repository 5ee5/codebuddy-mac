import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PracticeWorkspace } from "@/components/workspace/practice-workspace";
import { EXERCISES } from "@/lib/exercises";
import { accessibleText, decodeEntities } from "@/test/markup";

describe("PracticeWorkspace", () => {
  const html = renderToStaticMarkup(<PracticeWorkspace />);
  const t = accessibleText(html);

  it("keeps the exercise picker, brief, hints and starter code", () => {
    for (const exercise of EXERCISES) expect(t).toContain(exercise.title);
    const first = EXERCISES[0];
    for (const requirement of first.requirements) expect(t).toContain(requirement);
    expect(t).toContain(`0 of ${first.hints.length} used`);
    expect(decodeEntities(html)).toContain(first.starterCode.trimEnd().split("\n")[0]);
    expect(t).toContain("Reset to starter code");
  });

  it("offers Check answer instead of the request preview", () => {
    expect(html).toMatch(/<button type="submit"[^>]*>[\s\S]*?Check answer<\/button>/);
    expect(t).not.toContain("Preview request");
    expect(t).toContain("No answer checked yet");
  });
});
