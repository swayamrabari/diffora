export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-24 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-24 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-24 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="h-64 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
