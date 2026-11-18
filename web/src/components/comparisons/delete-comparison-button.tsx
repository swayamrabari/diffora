"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2Icon } from "lucide-react";

type DeleteComparisonButtonProps = {
  comparisonId: string;
  projectId: string;
};

export function DeleteComparisonButton({
  comparisonId,
  projectId,
}: DeleteComparisonButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!window.confirm("Delete this comparison? This cannot be undone.")) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/comparisons/${comparisonId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        window.alert(data?.error?.message ?? "Could not delete the comparison.");
        return;
      }
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch {
      window.alert("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={loading}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-2.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
    >
      <Trash2Icon className="size-3.5" />
      {loading ? "Deleting…" : "Delete"}
    </button>
  );
}
