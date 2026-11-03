"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { clearHistory } from "@/lib/db/ai-requests";

/*
 * Clearing history. The database only lets each student clear their own
 * entries; the question and answer are removed, but the entry still counts
 * towards the daily limit.
 */

export async function deleteHistoryEntry(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id === "string") await clearHistory(id);
  if (formData.get("from") === "entry") redirect("/history");
  refresh();
}

export async function clearAllHistory(): Promise<void> {
  await clearHistory();
  refresh();
}
