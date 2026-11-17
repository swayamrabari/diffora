"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      if (!response.ok) {
        setError(data?.error?.message ?? "Could not create the account.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-6">
        <p className="text-sm font-medium text-zinc-500">Diffora</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Create an account
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Upload specs, compare versions, and review changes.
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}

        <div>
          <label htmlFor="name" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="email" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="password" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">At least 8 characters.</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-zinc-950 underline underline-offset-4 dark:text-zinc-50"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
