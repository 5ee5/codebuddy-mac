import type { Metadata } from "next";
import { ModeHeader } from "@/components/mode-header";
import { PracticeWorkspace } from "@/components/workspace/practice-workspace";
import { getMode } from "@/lib/modes";

const mode = getMode("practice");

export const metadata: Metadata = {
  title: mode.label,
  description: mode.description,
};

export default function PracticePage() {
  return (
    <div data-mode={mode.id}>
      <ModeHeader mode={mode} />
      <PracticeWorkspace />
    </div>
  );
}
