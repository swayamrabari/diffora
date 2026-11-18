"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockLine,
} from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  buildChangeDiff,
  categoryLabels,
  categoryOrder,
  changeSearchText,
  changeSubject,
  changeTitle,
  changeTypeLabel,
  humanize,
  isDeprecatedChange,
  type DiffChangeItem,
} from "@/lib/structured-diff";
import type { SourceHunk, SourceLine } from "@/types/comparison";

type StructuredDiffViewProps = {
  changes: DiffChangeItem[];
};

function categoryRank(category: string): number {
  const index = categoryOrder.indexOf(category);
  return index === -1 ? categoryOrder.length : index;
}

const changeTypeBadgeClasses: Record<string, string> = {
  added:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  removed: "border-destructive/20 bg-destructive/10 text-destructive",
  modified:
    "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

function changeTypeBadgeClass(changeType: string): string {
  return (
    changeTypeBadgeClasses[changeType] ??
    "border-border bg-muted/40 text-muted-foreground"
  );
}

function sourceTone(kind: SourceLine["kind"]): string {
  if (kind === "added") {
    return "bg-emerald-500/10 text-emerald-700 after:text-emerald-700 dark:text-emerald-300 dark:after:text-emerald-300";
  }
  if (kind === "removed") {
    return "bg-destructive/10 text-destructive after:text-destructive dark:bg-destructive/20";
  }
  return "text-muted-foreground";
}

function sourceGutterTone(kind: SourceLine["kind"]): string {
  if (kind === "added") {
    return "text-emerald-700 dark:text-emerald-300";
  }
  if (kind === "removed") {
    return "text-destructive";
  }
  return "text-muted-foreground";
}

function SourceLineRow({ line }: { line: SourceLine }) {
  if (line.kind === "gap") {
    return (
      <CodeBlockLine className="bg-muted/40 text-center text-xs text-muted-foreground">
        <span className="block py-0.5">{line.text}</span>
      </CodeBlockLine>
    );
  }

  const gutter = sourceGutterTone(line.kind);
  return (
    <CodeBlockLine
      variant={line.kind === "context" ? "default" : line.kind}
      className={sourceTone(line.kind)}
    >
      <span className="flex min-w-max items-baseline">
        <span
          className={`w-12 shrink-0 select-none pr-2 text-right font-mono text-sm ${gutter}`}
        >
          {line.oldLine ?? ""}
        </span>
        <span
          className={`w-12 shrink-0 select-none pr-3 text-right font-mono text-sm ${gutter}`}
        >
          {line.newLine ?? ""}
        </span>
        <span className="whitespace-pre">{line.text || " "}</span>
      </span>
    </CodeBlockLine>
  );
}

function SourceDiffBody({ hunks }: { hunks: SourceHunk[] }) {
  const rows: SourceLine[] = [];
  for (const [index, hunk] of hunks.entries()) {
    if (index > 0) {
      rows.push({ kind: "gap", text: "⋯" });
    }
    rows.push(...hunk.lines);
  }

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        No source lines to display for this change.
      </p>
    );
  }

  return (
    <CodeBlock className="rounded-none border-0 bg-card dark:bg-card">
      <CodeBlockContent className="px-4 py-3 [&>code]:w-full">
        {rows.map((line, index) => (
          <SourceLineRow key={`${line.kind}-${index}`} line={line} />
        ))}
      </CodeBlockContent>
    </CodeBlock>
  );
}

function ValueDiffBody({ change }: { change: DiffChangeItem }) {
  const lines = useMemo(() => buildChangeDiff(change), [change]);

  if (lines.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        No values to display for this change.
      </p>
    );
  }

  return (
    <CodeBlock className="rounded-none border-0 bg-card dark:bg-card">
      <CodeBlockContent lineNumbers className="px-4 py-3 [&>code]:w-full">
        {lines.map((line, index) => (
          <CodeBlockLine
            key={`${line.kind}-${index}`}
            variant={line.kind === "context" ? "default" : line.kind}
            className={sourceTone(line.kind)}
          >
            {line.text}
          </CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  );
}

function ChangeCard({ change }: { change: DiffChangeItem }) {
  const sourceHunks = change.source?.hunks ?? [];

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={changeTypeBadgeClass(change.changeType)}
          >
            {changeTypeLabel(change.changeType)}
          </Badge>
          <Badge
            variant="outline"
            className="border-border bg-muted/40 text-muted-foreground"
          >
            {categoryLabels[change.category] ?? humanize(change.category)}
          </Badge>
          {change.subcategory ? (
            <Badge
              variant="outline"
              className="border-border bg-muted/40 text-muted-foreground"
            >
              {humanize(change.subcategory)}
            </Badge>
          ) : null}
          {isDeprecatedChange(change) ? (
            <Badge variant="destructive">Deprecated</Badge>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="min-w-0 break-words text-sm font-semibold">
            {changeSubject(change)}
          </h3>
          <p className="text-sm text-muted-foreground">{changeTitle(change)}</p>
        </div>
      </header>

      <div className="border-t border-border">
        {sourceHunks.length > 0 ? (
          <SourceDiffBody hunks={sourceHunks} />
        ) : (
          <ValueDiffBody change={change} />
        )}
      </div>
    </article>
  );
}

function TypeButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors lg:w-full ${
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] ${
          active
            ? "bg-primary-foreground/15 text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export function StructuredDiffView({ changes }: StructuredDiffViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("sc_q") ?? "";
  const category = searchParams.get("sc_category") ?? "";
  const changeType = searchParams.get("sc_type") ?? "";
  const method = searchParams.get("sc_method") ?? "";
  const deprecatedOnly = searchParams.get("sc_deprecated") === "1";

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const change of changes) {
      counts.set(change.category, (counts.get(change.category) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(
      ([left], [right]) => categoryRank(left) - categoryRank(right),
    );
  }, [changes]);

  const methods = useMemo(
    () =>
      Array.from(
        new Set(changes.map((change) => change.method).filter(Boolean) as string[]),
      ).sort(),
    [changes],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return changes.filter((change) => {
      if (category && change.category !== category) {
        return false;
      }
      if (changeType && change.changeType !== changeType) {
        return false;
      }
      if (method && change.method !== method) {
        return false;
      }
      if (deprecatedOnly && !isDeprecatedChange(change)) {
        return false;
      }
      if (needle && !changeSearchText(change).includes(needle)) {
        return false;
      }
      return true;
    });
  }, [category, changeType, changes, deprecatedOnly, method, q]);

  const selectedLabel = category
    ? categoryLabels[category] ?? humanize(category)
    : "All changes";

  function update(values: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearFilters() {
    update({
      sc_q: null,
      sc_type: null,
      sc_method: null,
      sc_deprecated: null,
    });
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
      <aside className="flex max-h-40 shrink-0 flex-col border-b border-border bg-muted/20 lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
        <div className="hidden shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3 lg:flex">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Change types
          </span>
          <Badge variant="outline">{changes.length}</Badge>
        </div>
        <div className="flex gap-1 overflow-x-auto p-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:p-3">
          <TypeButton
            label="All changes"
            count={changes.length}
            active={!category}
            onClick={() => update({ sc_category: null })}
          />
          {categoryCounts.map(([item, count]) => (
            <TypeButton
              key={item}
              label={categoryLabels[item] ?? humanize(item)}
              count={count}
              active={category === item}
              onClick={() => update({ sc_category: item })}
            />
          ))}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{selectedLabel}</h2>
              <p className="text-xs text-muted-foreground">
                {filtered.length} of {changes.length} changes
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(event) => update({ sc_q: event.target.value || null })}
              placeholder="Search changes…"
              className="h-8 min-w-[200px] flex-1"
            />
            <select
              value={changeType}
              onChange={(event) => update({ sc_type: event.target.value || null })}
              className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">All changes</option>
              <option value="added">Added</option>
              <option value="removed">Removed</option>
              <option value="modified">Modified</option>
            </select>
            <select
              value={method}
              onChange={(event) => update({ sc_method: event.target.value || null })}
              className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">All methods</option>
              {methods.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant={deprecatedOnly ? "default" : "outline"}
              className="h-8 px-3"
              onClick={() =>
                update({ sc_deprecated: deprecatedOnly ? null : "1" })
              }
            >
              Deprecated
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-8 px-3"
              onClick={clearFilters}
            >
              Clear
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 pt-4 pb-24">
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-border bg-card px-5 py-16 text-center">
                <p className="text-sm font-medium">No changes match these filters</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose another type or clear the filters.
                </p>
              </div>
            ) : (
              filtered.map((change) => <ChangeCard key={change.id} change={change} />)
            )}
          </div>
        </ScrollArea>
      </section>
    </div>
  );
}
