"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock, CodeBlockHeader, CodeBlockTitle } from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CopyButton } from "@/components/ui/copy-button";
import {
  buildStructuredTree,
  categoryLabels,
  categoryOrder,
  changeSearchText,
  formatValue,
  type DiffChangeItem,
  type StructuredNode,
} from "@/lib/structured-diff";

type StructuredDiffViewProps = {
  changes: DiffChangeItem[];
};

function changeBadgeVariant(changeType: string): "default" | "secondary" | "outline" | "destructive" {
  switch (changeType) {
    case "added":
      return "secondary";
    case "removed":
      return "destructive";
    default:
      return "outline";
  }
}

function changeTitle(change: DiffChangeItem): string {
  if (change.field) {
    return change.field;
  }
  const parts = change.displayPointer.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : change.category;
}

function diffText(field: string | null, present: boolean, value: unknown, prefix: "-" | "+"): string {
  if (!present) {
    return `${prefix} Not present`;
  }
  const formatted = formatValue(true, value);
  const label = field ?? "value";
  if (formatted.includes("\n")) {
    return formatted
      .split("\n")
      .map((line) => `${prefix} ${line}`)
      .join("\n");
  }
  return `${prefix} ${label}: ${formatted}`;
}

function ValuePanel({
  title,
  text,
  tone,
}: {
  title: string;
  text: string;
  tone: "removed" | "added";
}) {
  return (
    <CodeBlock className={tone === "removed" ? "border-destructive/30" : undefined}>
      <CodeBlockHeader>
        <CodeBlockTitle>{title}</CodeBlockTitle>
      </CodeBlockHeader>
      <pre
        className={`max-h-72 overflow-auto border-t px-4 py-3 font-mono text-xs leading-5 ${
          tone === "removed"
            ? "bg-destructive/5 text-destructive"
            : "bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
        }`}
      >
        <code>{text}</code>
      </pre>
    </CodeBlock>
  );
}

function StructuredTreeNode({
  node,
  selected,
  collapsed,
  onToggle,
  onSelect,
}: {
  node: StructuredNode;
  selected: string | null;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.children.length > 0 || node.changes.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
        aria-expanded={!isCollapsed}
      >
        <span className="w-4 text-xs text-muted-foreground">
          {hasChildren ? (isCollapsed ? "▸" : "▾") : ""}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{node.label}</span>
        <Badge variant="outline">{node.count}</Badge>
      </button>

      {!isCollapsed ? (
        <div className="ml-4 border-l border-border pl-2">
          {node.children.map((child) => (
            <StructuredTreeNode
              key={child.id}
              node={child}
              selected={selected}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
          {node.changes.map((change) => (
            <button
              key={change.id}
              type="button"
              onClick={() => onSelect(change.id)}
              className={`mt-0.5 flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                selected === change.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <Badge
                variant={changeBadgeVariant(change.changeType)}
                className="mt-0.5 shrink-0"
              >
                {change.changeType}
              </Badge>
              <span className="min-w-0 flex-1 truncate">{changeTitle(change)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StructuredDiffView({ changes }: StructuredDiffViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const q = searchParams.get("sc_q") ?? "";
  const category = searchParams.get("sc_category") ?? "";
  const changeType = searchParams.get("sc_type") ?? "";
  const method = searchParams.get("sc_method") ?? "";
  const groupBy = searchParams.get("sc_group") === "endpoint" ? "endpoint" : "type";
  const selected = searchParams.get("sc_change");

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
      if (needle && !changeSearchText(change).includes(needle)) {
        return false;
      }
      return true;
    });
  }, [category, changeType, changes, method, q]);

  const tree = useMemo(
    () => buildStructuredTree(filtered, groupBy === "endpoint" ? "endpoint" : "type"),
    [filtered, groupBy],
  );
  const selectedChange = changes.find((change) => change.id === selected) ?? null;

  const categories = useMemo(
    () =>
      Array.from(new Set(changes.map((change) => change.category))).sort(
        (left, right) =>
          categoryOrder.indexOf(left) - categoryOrder.indexOf(right),
      ),
    [changes],
  );
  const methods = useMemo(
    () =>
      Array.from(
        new Set(changes.map((change) => change.method).filter(Boolean) as string[]),
      ).sort(),
    [changes],
  );

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

  function toggleNode(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clear() {
    update({ sc_q: null, sc_category: null, sc_type: null, sc_method: null, sc_change: null });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(event) => update({ sc_q: event.target.value || null, sc_change: null })}
          placeholder="Search field, path, method, component, value…"
          className="min-w-[240px] flex-1"
        />
        <select
          value={category}
          onChange={(event) => update({ sc_category: event.target.value || null, sc_change: null })}
          className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">All types</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {categoryLabels[item] ?? item}
            </option>
          ))}
        </select>
        <select
          value={changeType}
          onChange={(event) => update({ sc_type: event.target.value || null, sc_change: null })}
          className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">All changes</option>
          <option value="added">Added</option>
          <option value="removed">Removed</option>
          <option value="modified">Modified</option>
        </select>
        <select
          value={method}
          onChange={(event) => update({ sc_method: event.target.value || null, sc_change: null })}
          className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">All methods</option>
          {methods.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={groupBy}
          onChange={(event) => update({ sc_group: event.target.value === "endpoint" ? "endpoint" : null })}
          className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="type">Group by type</option>
          <option value="endpoint">Group by endpoint</option>
        </select>
        <Button type="button" variant="outline" onClick={clear}>
          Clear
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} of {changes.length} unique changes
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="max-h-[70vh] overflow-hidden rounded-lg border border-border bg-card">
          <ScrollArea className="h-[70vh] p-2">
            {tree.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No changes match these filters.
              </p>
            ) : (
              tree.map((node) => (
                <StructuredTreeNode
                  key={node.id}
                  node={node}
                  selected={selected}
                  collapsed={collapsed}
                  onToggle={toggleNode}
                  onSelect={(id) => update({ sc_change: id })}
                />
              ))
            )}
          </ScrollArea>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          {selectedChange ? (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {categoryLabels[selectedChange.category] ?? selectedChange.category}
                </Badge>
                <Badge variant={changeBadgeVariant(selectedChange.changeType)}>
                  {selectedChange.changeType}
                </Badge>
                {selectedChange.subcategory ? (
                  <Badge variant="outline">{selectedChange.subcategory}</Badge>
                ) : null}
              </div>

              <h2 className="mt-3 text-lg font-semibold">
                {changeTitle(selectedChange)}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedChange.method ? `${selectedChange.method} ` : ""}
                {selectedChange.path ?? selectedChange.component ?? ""}
              </p>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {selectedChange.changeType !== "added" ? (
                  <ValuePanel
                    title="Before"
                    tone="removed"
                    text={diffText(
                      selectedChange.field,
                      selectedChange.oldValuePresent,
                      selectedChange.oldValue,
                      "-",
                    )}
                  />
                ) : null}
                {selectedChange.changeType !== "removed" ? (
                  <ValuePanel
                    title="After"
                    tone="added"
                    text={diffText(
                      selectedChange.field,
                      selectedChange.newValuePresent,
                      selectedChange.newValue,
                      "+",
                    )}
                  />
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <CopyButton
                  value={JSON.stringify(selectedChange, null, 2)}
                  label="Copy change JSON"
                />
              </div>

              <details className="mt-4 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Technical details</summary>
                <div className="mt-2 space-y-1 font-mono break-all">
                  <p>{selectedChange.displayPointer}</p>
                  {selectedChange.basePointer ? <p>base: {selectedChange.basePointer}</p> : null}
                  {selectedChange.targetPointer ? <p>target: {selectedChange.targetPointer}</p> : null}
                </div>
              </details>
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm font-medium">Select a change</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Click a change in the tree to see the before/after values.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
