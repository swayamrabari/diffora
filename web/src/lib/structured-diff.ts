export type DiffChangeItem = {
  id: string;
  position: number;
  category: string;
  changeType: string;
  subcategory: string | null;
  path: string | null;
  method: string | null;
  component: string | null;
  field: string | null;
  basePointer: string | null;
  targetPointer: string | null;
  displayPointer: string;
  oldValue: unknown;
  newValue: unknown;
  oldValuePresent: boolean;
  newValuePresent: boolean;
};

export type StructuredNode = {
  id: string;
  label: string;
  count: number;
  children: StructuredNode[];
  changes: DiffChangeItem[];
};

export const categoryLabels: Record<string, string> = {
  endpoint: "Endpoints",
  operation: "Operations",
  parameter: "Parameters",
  request: "Request bodies",
  response: "Responses",
  header: "Headers",
  schema: "Schemas",
  security: "Security",
  server: "Servers",
  metadata: "Metadata",
  webhook: "Webhooks",
  other: "Other",
};

export const categoryOrder = [
  "endpoint",
  "operation",
  "parameter",
  "request",
  "response",
  "header",
  "schema",
  "security",
  "server",
  "metadata",
  "webhook",
  "other",
];

export function formatValue(present: boolean, value: unknown): string {
  if (!present) {
    return "Not present";
  }
  if (value === null) {
    return "null";
  }
  return JSON.stringify(value, null, 2) ?? String(value);
}

export function changeSearchText(change: DiffChangeItem): string {
  return [
    change.category,
    change.changeType,
    change.subcategory,
    change.path,
    change.method,
    change.component,
    change.field,
    change.displayPointer,
    change.oldValuePresent ? JSON.stringify(change.oldValue) : "",
    change.newValuePresent ? JSON.stringify(change.newValue) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function categoryRank(category: string): number {
  const index = categoryOrder.indexOf(category);
  return index === -1 ? categoryOrder.length : index;
}

function groupLabel(change: DiffChangeItem): string {
  if (change.path) {
    return change.method ? `${change.method} ${change.path}` : change.path;
  }
  if (change.component) {
    return `Component: ${change.component}`;
  }
  if (change.subcategory) {
    return change.subcategory;
  }
  return "General";
}

export function buildStructuredTree(
  changes: DiffChangeItem[],
  groupBy: "type" | "endpoint",
): StructuredNode[] {
  if (groupBy === "endpoint") {
    const paths = new Map<string, Map<string, DiffChangeItem[]>>();
    const noPath: DiffChangeItem[] = [];

    for (const change of changes) {
      if (!change.path) {
        noPath.push(change);
        continue;
      }
      const methods = paths.get(change.path) ?? new Map<string, DiffChangeItem[]>();
      const key = change.method ?? "Path";
      const items = methods.get(key) ?? [];
      items.push(change);
      methods.set(key, items);
      paths.set(change.path, methods);
    }

    const nodes: StructuredNode[] = Array.from(paths.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, methods]) => {
        const children = Array.from(methods.entries())
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([method, items]) => ({
            id: `endpoint:${path}:${method}`,
            label: method,
            count: items.length,
            children: [],
            changes: items,
          }));
        return {
          id: `endpoint:${path}`,
          label: path,
          count: children.reduce((sum, child) => sum + child.count, 0),
          children,
          changes: [],
        };
      });

    if (noPath.length > 0) {
      nodes.push({
        id: "endpoint:none",
        label: "Components and other",
        count: noPath.length,
        children: [],
        changes: noPath,
      });
    }
    return nodes;
  }

  const categories = new Map<string, Map<string, DiffChangeItem[]>>();
  for (const change of changes) {
    const groups = categories.get(change.category) ?? new Map<string, DiffChangeItem[]>();
    const label = groupLabel(change);
    const items = groups.get(label) ?? [];
    items.push(change);
    groups.set(label, items);
    categories.set(change.category, groups);
  }

  return Array.from(categories.entries())
    .sort(([left], [right]) => categoryRank(left) - categoryRank(right))
    .map(([category, groups]) => {
      const children = Array.from(groups.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, items]) => ({
          id: `type:${category}:${label}`,
          label,
          count: items.length,
          children: [],
          changes: items,
        }));
      return {
        id: `type:${category}`,
        label: categoryLabels[category] ?? category,
        count: children.reduce((sum, child) => sum + child.count, 0),
        children,
        changes: [],
      };
    });
}
