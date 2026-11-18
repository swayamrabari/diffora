"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type DeleteProjectButtonProps = {
  projectId: string;
  projectName: string;
};

export function DeleteProjectButton({ projectId, projectName }: DeleteProjectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    const confirmed = window.confirm(
      `Delete "${projectName}"? Its versions and comparisons will also be deleted.`,
    );
    if (!confirmed) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        window.alert(data?.error?.message ?? "Could not delete the project.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      window.alert("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="destructive" onClick={onDelete} disabled={loading}>
      {loading ? "Deleting…" : "Delete"}
    </Button>
  );
}
