"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOutIcon } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type TopBarProps = {
  user: {
    name: string;
    email: string;
  };
};

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }
  return email.slice(0, 1).toUpperCase();
}

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
          className="flex min-w-0 flex-1 items-center gap-2 font-mono text-sm font-medium text-muted-foreground"
        />

        {/* Compact avatar. The account card opens on hover or keyboard focus. */}
        <div className="group relative shrink-0">
          <button
            type="button"
            aria-label={`Account menu for ${user.name}`}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground transition-opacity outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {initials(user.name, user.email)}
          </button>

          <div className="invisible absolute top-full right-0 z-50 w-60 translate-y-1 pt-2 opacity-0 transition-all duration-150 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
            <div className="overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
              <div className="px-3 py-2.5">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <div className="border-t border-border p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={logout}
                  disabled={loading}
                >
                  {loading ? <Spinner /> : <LogOutIcon />}
                  {loading ? "Signing out…" : "Log out"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
