"use client";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          The page could not be loaded. Try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
