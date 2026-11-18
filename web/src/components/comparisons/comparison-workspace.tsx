"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { DeleteComparisonButton } from "@/components/comparisons/delete-comparison-button";
import { StructuredDiffView } from "@/components/comparisons/structured-diff-view";
import { formatDate } from "@/lib/format";
import {
  categoryLabels,
  type DiffChangeItem,
} from "@/lib/structured-diff";
import {
  buildFindingTree,
  groupFindings,
  type FindingGroup,
  type FindingItem,
  type FindingTreeNode,
} from "@/lib/group-findings";

type DeprecationItem = {
  id: string;
  position: number;
  pointer: string;
  path: string | null;
  method: string | null;
  oldValue: unknown;
  newValue: unknown;
  oldValuePresent: boolean;
  newValuePresent: boolean;
};

type ComparisonInfo = {
  id: string;
  projectId: string;
  status: string;
  engineVersion: string;
  durationMs: number;
  totalChangelog: number;
  totalBreaking: number;
  totalDeprecations: number;
  totalDiffChanges: number;
  summary: unknown;
  errorMessage: string | null;
  createdAt: string;
  project: { id: string; name: string };
  baseVersion: { id: string; label: string; title: string };
  targetVersion: { id: string; label: string; title: string };
};

type SummaryShape = {
  diff?: boolean;
  details?: Record<string, Record<string, number>>;
};

type ComparisonWorkspaceProps = {
  comparison: ComparisonInfo;
  findings: FindingItem[];
  diffChanges: DiffChangeItem[];
  deprecations: DeprecationItem[];
};

type Tab = "summary" | "changes" | "breaking" | "deprecations";

function levelClass(levelName: string): string {
  switch (levelName) {
    case "error":
      return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
    case "warning":
      return "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    default:
      return "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
  }
}

function formatDeprecation(deprecation: DeprecationItem): {
  title: string;
  kind: string;
} {
  if (deprecation.path) {
    const method = deprecation.method ? `${deprecation.method} ` : "";
    return { title: `${method}${deprecation.path}`, kind: "Operation" };
  }

  const segments = deprecation.pointer
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

  if (segments[0] === "paths" && segments[1]) {
    const method = segments[2] ? `${segments[2].toUpperCase()} ` : "";
    return { title: `${method}${segments[1]}`, kind: "Operation" };
  }

  if (segments[0] === "components" && segments[1] && segments[2]) {
    const type = segments[1].replace(/s$/, "");
    const name = segments[2];
    const propertyIndex = segments.indexOf("properties");
    if (propertyIndex >= 0 && segments[propertyIndex + 1]) {
      return {
        title: `${type} ${name} → property ${segments[propertyIndex + 1]}`,
        kind: "Property",
      };
    }
    return { title: `${type} ${name}`, kind: type };
  }

  return { title: deprecation.pointer, kind: "Deprecation" };
}

function displayValue(present: boolean, value: unknown): string {
  if (!present) {
    return "Not present";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function TreeNode({
  node,
  selected,
  collapsed,
  onToggle,
  onSelect,
}: {
  node: FindingTreeNode;
  selected: string | null;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.children.length > 0 || node.groups.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
        aria-expanded={!isCollapsed}
      >
        <span className="w-4 text-xs text-zinc-400">{hasChildren ? (isCollapsed ? "▸" : "▾") : ""}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-zinc-800 dark:text-zinc-200">
          {node.label}
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {node.count}
        </span>
      </button>

      {!isCollapsed ? (
        <div className="ml-4 border-l border-zinc-200 pl-2 dark:border-zinc-800">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selected={selected}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
          {node.groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelect(group.id)}
              className={`mt-0.5 flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm ${
                selected === group.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              <span
                className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${levelClass(
                  group.levelName,
                )}`}
              >
                {group.levelName}
              </span>
              <span className="min-w-0 flex-1 truncate">{group.text}</span>
              {group.findings.length > 1 ? (
                <span className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  ×{group.findings.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ComparisonWorkspace({
  comparison,
  findings,
  diffChanges,
  deprecations,
}: ComparisonWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tabParam = searchParams.get("tab");
  const tab: Tab =
    tabParam === "summary" || tabParam === "breaking" || tabParam === "deprecations"
      ? tabParam
      : "changes";
  const grouped = searchParams.get("grouped") !== "0";
  const q = searchParams.get("q") ?? "";
  const level = searchParams.get("level") ?? "";
  const section = searchParams.get("section") ?? "";
  const method = searchParams.get("method") ?? "";
  const selected = searchParams.get("change");

  const summary = (comparison.summary ?? null) as SummaryShape | null;
  const failed = comparison.status === "failed";

  const changelog = useMemo(
    () => findings.filter((finding) => finding.kind === "changelog"),
    [findings],
  );
  const breaking = useMemo(
    () => findings.filter((finding) => finding.kind === "breaking"),
    [findings],
  );
  const uniqueBreaking = useMemo(() => groupFindings(breaking, true).length, [breaking]);

  const activeFindings = breaking;
  const filteredFindings = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activeFindings.filter((finding) => {
      if (level && finding.levelName !== level) {
        return false;
      }
      if (section && finding.section !== section) {
        return false;
      }
      if (method && finding.operation !== method) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return [finding.text, finding.ruleId, finding.path, finding.operation, finding.operationId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [activeFindings, level, method, section, q]);

  const groups = useMemo(
    () => groupFindings(filteredFindings, grouped),
    [filteredFindings, grouped],
  );
  const tree = useMemo(() => buildFindingTree(groups), [groups]);
  const selectedGroup = groups.find((group) => group.id === selected) ?? null;

  const sectionOptions = useMemo(
    () =>
      Array.from(
        new Set(activeFindings.map((finding) => finding.section).filter(Boolean) as string[]),
      ).sort(),
    [activeFindings],
  );
  const methodOptions = useMemo(
    () =>
      Array.from(
        new Set(activeFindings.map((finding) => finding.operation).filter(Boolean) as string[]),
      ).sort(),
    [activeFindings],
  );

  const filteredDeprecations = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      return deprecations;
    }
    return deprecations.filter((deprecation) =>
      [deprecation.pointer, deprecation.path, deprecation.method]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [deprecations, q]);

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const finding of changelog) {
      counts[finding.levelName] = (counts[finding.levelName] ?? 0) + 1;
    }
    return counts;
  }, [changelog]);

  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const finding of changelog) {
      const key = finding.section ?? "other";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [changelog]);

  const structuredCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const change of diffChanges) {
      counts[change.category] = (counts[change.category] ?? 0) + 1;
    }
    return counts;
  }, [diffChanges]);

  function updateParams(values: Record<string, string | null>) {
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

  function switchTab(next: Tab) {
    updateParams({ tab: next, change: null });
  }

  function toggleGrouped() {
    updateParams({ grouped: grouped ? "0" : null, change: null });
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

  function clearFilters() {
    updateParams({ q: null, level: null, section: null, method: null, change: null });
  }

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "summary", label: "Summary" },
    { id: "changes", label: "Changes", count: comparison.totalDiffChanges },
    { id: "breaking", label: "Breaking", count: comparison.totalBreaking },
    { id: "deprecations", label: "Deprecations", count: comparison.totalDeprecations },
  ];

  const maxSection = Math.max(1, ...Object.values(sectionCounts));
  const maxLevel = Math.max(1, ...Object.values(levelCounts));
  const maxCategory = Math.max(1, ...Object.values(structuredCategoryCounts));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${comparison.projectId}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← {comparison.project.name}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {comparison.baseVersion.label} → {comparison.targetVersion.label}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {comparison.baseVersion.title} → {comparison.targetVersion.title}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {formatDate(comparison.createdAt)} · engine {comparison.engineVersion} ·{" "}
              {comparison.durationMs} ms
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/comparisons/${comparison.id}/export`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Export JSON
            </a>
            <DeleteComparisonButton
              comparisonId={comparison.id}
              projectId={comparison.projectId}
            />
          </div>
        </div>
      </div>

      {failed ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">Comparison failed</p>
          <p className="mt-1">
            {comparison.errorMessage ?? "The comparison could not be completed."}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Diff changes", value: comparison.totalDiffChanges, hint: "deduplicated" },
          { label: "Breaking", value: comparison.totalBreaking, hint: `${uniqueBreaking} unique` },
          { label: "Deprecations", value: comparison.totalDeprecations, hint: "operation/component" },
          { label: "Status", value: comparison.status, hint: comparison.engineVersion },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-xs text-zinc-500">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {card.value}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => switchTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === item.id
                ? "border-zinc-900 text-zinc-950 dark:border-zinc-100 dark:text-zinc-50"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="ml-2 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "summary" ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Structured changes", value: comparison.totalDiffChanges },
              { label: "Raw findings", value: comparison.totalChangelog },
              { label: "Unique breaking", value: uniqueBreaking },
              { label: "Levels", value: `${levelCounts.info ?? 0} info / ${levelCounts.warning ?? 0} warn / ${levelCounts.error ?? 0} error` },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <p className="text-xs text-zinc-500">{card.label}</p>
                <p className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">By level</h2>
              <div className="mt-4 space-y-3">
                {Object.entries(levelCounts).map(([name, count]) => (
                  <div key={name}>
                    <div className="mb-1 flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="capitalize">{name}</span>
                      <span>{count}</span>
                    </div>
                    <div className="h-2 rounded bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-2 rounded bg-zinc-900 dark:bg-zinc-200"
                        style={{ width: `${(count / maxLevel) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">By section</h2>
              <div className="mt-4 space-y-3">
                {Object.entries(sectionCounts).map(([name, count]) => (
                  <div key={name}>
                    <div className="mb-1 flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="capitalize">{name}</span>
                      <span>{count}</span>
                    </div>
                    <div className="h-2 rounded bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-2 rounded bg-zinc-900 dark:bg-zinc-200"
                        style={{ width: `${(count / maxSection) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">By type</h2>
            <div className="mt-4 space-y-3">
              {Object.entries(structuredCategoryCounts).map(([name, count]) => (
                <div key={name}>
                  <div className="mb-1 flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                    <span>{categoryLabels[name] ?? name}</span>
                    <span>{count}</span>
                  </div>
                  <div className="h-2 rounded bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-2 rounded bg-zinc-900 dark:bg-zinc-200"
                      style={{ width: `${(count / maxCategory) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Engine summary
              </h2>
            </div>
            {summary?.details && Object.keys(summary.details).length > 0 ? (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {Object.entries(summary.details).map(([sectionName, counts]) => (
                  <div key={sectionName} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                    <span className="w-32 font-medium capitalize text-zinc-800 dark:text-zinc-200">
                      {sectionName}
                    </span>
                    {Object.entries(counts).map(([kind, count]) => (
                      <span
                        key={kind}
                        className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {kind}: {count}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-5 py-6 text-sm text-zinc-500">No summary details.</p>
            )}
          </section>
        </div>
      ) : null}

      {tab === "changes" ? (
        comparison.totalDiffChanges === 0 && comparison.totalChangelog > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <p className="font-medium">This comparison predates structured diff storage.</p>
            <p className="mt-1">
              Re-run the comparison from the project page to generate type-based, deduplicated changes
              with before/after values.
            </p>
          </div>
        ) : (
          <StructuredDiffView changes={diffChanges} />
        )
      ) : null}

      {tab === "breaking" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(event) => updateParams({ q: event.target.value || null, change: null })}
              placeholder="Search text, rule, path, operation…"
              className="min-w-[220px] flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <select
              value={level}
              onChange={(event) => updateParams({ level: event.target.value || null, change: null })}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">All levels</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
            <select
              value={section}
              onChange={(event) => updateParams({ section: event.target.value || null, change: null })}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">All sections</option>
              {sectionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={method}
              onChange={(event) => updateParams({ method: event.target.value || null, change: null })}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">All methods</option>
              {methodOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={toggleGrouped}
              className={`rounded-md border px-3 py-2 text-sm ${
                grouped
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                  : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              }`}
            >
              Group duplicates
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            >
              Clear
            </button>
          </div>

          <div className="text-xs text-zinc-500">
            {filteredFindings.length} findings · {groups.length} {grouped ? "grouped" : "rows"}
          </div>

          <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <section className="max-h-[70vh] overflow-auto rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
              {tree.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-zinc-500">
                  No changes match these filters.
                </p>
              ) : (
                tree.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    selected={selected}
                    collapsed={collapsed}
                    onToggle={toggleNode}
                    onSelect={(id) => updateParams({ change: id })}
                  />
                ))
              )}
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              {selectedGroup ? (
                <GroupDetail group={selectedGroup} />
              ) : (
                <div className="py-12 text-center">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Select a change
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Click a finding in the tree to see its detail.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {tab === "deprecations" ? (
        <div className="space-y-4">
          <input
            value={q}
            onChange={(event) => updateParams({ q: event.target.value || null })}
            placeholder="Search deprecations…"
            className="w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />

          {filteredDeprecations.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white px-5 py-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                No deprecations
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                No operation or component was newly deprecated.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDeprecations.map((deprecation) => {
                const readable = formatDeprecation(deprecation);
                return (
                  <div
                    key={deprecation.id}
                    className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        Deprecated
                      </span>
                      <span className="text-xs text-zinc-500">{readable.kind}</span>
                    </div>
                    <p className="mt-2 font-mono text-sm text-zinc-900 dark:text-zinc-100">
                      {readable.title}
                    </p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="line-through">
                        {displayValue(deprecation.oldValuePresent, deprecation.oldValue)}
                      </span>{" "}
                      → <span className="font-medium">{displayValue(deprecation.newValuePresent, deprecation.newValue)}</span>
                    </p>
                    <details className="mt-3 text-xs text-zinc-500">
                      <summary className="cursor-pointer">Technical details</summary>
                      <code className="mt-1 block break-all">{deprecation.pointer}</code>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GroupDetail({ group }: { group: FindingGroup }) {
  const copyValue = JSON.stringify(
    {
      ruleId: group.ruleId,
      level: group.levelName,
      text: group.text,
      variants: group.variants,
      endpoints: group.endpoints,
      line: group.line,
      column: group.column,
    },
    null,
    2,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${levelClass(group.levelName)}`}>
          {group.levelName}
        </span>
        <span className="font-mono text-xs text-zinc-500">{group.ruleId}</span>
      </div>

      <h2 className="mt-3 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        {group.text}
      </h2>

      {group.variants.length > 1 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Variants ({group.variants.length})
          </p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
            {group.variants.map((variant) => (
              <li key={variant} className="rounded bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                {variant}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {group.endpoints.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Affects {group.endpoints.length} endpoint{group.endpoints.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {group.endpoints.map((endpoint) => (
              <li key={`${endpoint.method}-${endpoint.path}`} className="font-mono text-zinc-700 dark:text-zinc-300">
                {endpoint.method ? `${endpoint.method} ` : ""}
                {endpoint.path}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        {group.line !== null ? <span>line {group.line}</span> : null}
        {group.column !== null ? <span>column {group.column}</span> : null}
        <CopyButton value={copyValue} label="Copy JSON" />
      </div>
    </div>
  );
}
