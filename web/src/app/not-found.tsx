import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-medium text-zinc-500">404</p>
        <h1 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
