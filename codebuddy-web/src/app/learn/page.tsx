import type { Metadata } from "next";
import { ModeHeader } from "@/components/mode-header";
import { LearnWorkspace } from "@/components/workspace/learn-workspace";
import { getMode } from "@/lib/modes";

const mode = getMode("learn");

export const metadata: Metadata = {
  title: mode.label,
  description: mode.description,
};

export default function LearnPage() {
  return (
    <div data-mode={mode.id}>
      <ModeHeader mode={mode} />
      <LearnWorkspace />
    </div>
  );
}
