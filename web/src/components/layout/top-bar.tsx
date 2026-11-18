"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";

type TopBarProps = {
  user: {
    name: string;
    email: string;
  };
};

export function TopBar({ user }: TopBarProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="flex h-12 w-full items-center gap-3 px-3 sm:px-4">
        <Brand />
        <div
          id="app-header-breadcrumb"
          className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-muted-foreground"
        />
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-xs font-medium leading-4 text-foreground">{user.name}</p>
            <p className="text-[11px] leading-4 text-muted-foreground">{user.email}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={logout} disabled={loading}>
            {loading ? "Signing out…" : "Log out"}
          </Button>
        </div>
      </div>
    </header>
  );
}
