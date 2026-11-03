import type { Metadata } from "next";
import { ModeHeader } from "@/components/mode-header";
import { DebugWorkspace } from "@/components/workspace/debug-workspace";
import { getMode } from "@/lib/modes";

const mode = getMode("debug");

export const metadata: Metadata = {
  title: mode.label,
  description: mode.description,
};

export default function DebugPage() {
  return (
    <div data-mode={mode.id}>
      <ModeHeader mode={mode} />
      <DebugWorkspace />
    </div>
  );
}
