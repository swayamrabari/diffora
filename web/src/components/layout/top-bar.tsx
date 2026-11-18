"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/layout/brand";

type TopBarProps = {
  user: {
    name: string;
    email: string;
  };
};

export function TopBar({ user }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (pathname?.startsWith("/comparisons/")) {
    return null;
  }

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
    <header className="border-b border-border bg-card">
      <div className="flex h-12 w-full items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Brand />

        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
        </nav>

        <div className="ms-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-xs font-medium leading-4 text-foreground">{user.name}</p>
            <p className="text-[11px] leading-4 text-muted-foreground">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={loading}
            className="h-8 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {loading ? "Signing out…" : "Log out"}
          </button>
        </div>
      </div>
    </header>
  );
}
