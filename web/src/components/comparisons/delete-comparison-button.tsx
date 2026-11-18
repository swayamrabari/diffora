"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <Button type="button" variant="destructive" size="sm" onClick={onDelete} disabled={loading}>
      <Trash2Icon />
      {loading ? "Deleting…" : "Delete"}
    </Button>
  );
}
