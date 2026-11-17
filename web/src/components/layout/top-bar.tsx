"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-50"
          >
            Diffora
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{user.name}</p>
            <p className="text-xs text-zinc-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={loading}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {loading ? "Signing out…" : "Log out"}
          </button>
        </div>
      </div>
    </header>
  );
}
