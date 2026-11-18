import type { SourceDiff } from "@/types/comparison";

export type DiffChangeItem = {
  id: string;
  category: string;
  changeType: string;
  subcategory: string | null;
  path: string | null;
  method: string | null;
  component: string | null;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  oldValuePresent: boolean;
  newValuePresent: boolean;
  source?: SourceDiff;
};

export type StructuredNode = {
  id: string;
  label: string;
  count: number;
  children: StructuredNode[];
  changes: DiffChangeItem[];
};

export type DiffLine = {
  kind: "context" | "added" | "removed";
  text: string;
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

const categorySingular: Record<string, string> = {
  endpoint: "Endpoint",
  operation: "Operation",
  parameter: "Parameter",
  request: "Request body",
  response: "Response",
  header: "Header",
  schema: "Schema",
  security: "Security",
  server: "Server",
  metadata: "Metadata",
  webhook: "Webhook",
  other: "Item",
};

const fieldLabels: Record<string, string> = {
  description: "Description",
  summary: "Summary",
  title: "Title",
  version: "Version",
  required: "Required fields",
  minimum: "Minimum value",
  maximum: "Maximum value",
  exclusiveMinimum: "Exclusive minimum",
  exclusiveMaximum: "Exclusive maximum",
  minLength: "Minimum length",
  maxLength: "Maximum length",
  minItems: "Minimum items",
  maxItems: "Maximum items",
  minProperties: "Minimum properties",
  maxProperties: "Maximum properties",
  multipleOf: "Multiple of",
  enum: "Allowed values",
  default: "Default value",
  example: "Example",
  examples: "Examples",
  type: "Type",
  format: "Format",
  pattern: "Pattern",
  nullable: "Nullable",
  deprecated: "Deprecation",
  readOnly: "Read only",
  writeOnly: "Write only",
  additionalProperties: "Additional properties",
  operationId: "Operation ID",
  requestBody: "Request body",
  responses: "Responses",
  content: "Content",
  schema: "Schema",
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

export function humanize(value: string): string {
  const spaced = value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) {
    return value;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function fieldLabel(field: string): string {
  const segment = field.split(".").filter(Boolean).pop() ?? field;
  return fieldLabels[segment] ?? humanize(segment);
}

export function isDeprecatedChange(change: DiffChangeItem): boolean {
  if (change.field !== "deprecated") {
    return false;
  }
  return change.newValuePresent && change.newValue === true;
}

export function changeSubject(change: DiffChangeItem): string {
  if (change.path) {
    const subject = change.method ? `${change.method} ${change.path}` : change.path;
    if (change.category === "parameter" && change.field?.includes(".")) {
      const parameter = change.field.split(".")[0];
      return parameter ? `${subject} · ${parameter}` : subject;
    }
    return subject;
  }
  if (change.component) {
    if (change.category === "schema") {
      return `Schema ${change.component}`;
    }
    return `${categorySingular[change.category] ?? "Item"} ${change.component}`;
  }
  if (change.subcategory) {
    if (change.category === "parameter") {
      return `${humanize(change.subcategory)} parameter`;
    }
    return `${categorySingular[change.category] ?? "Item"} ${change.subcategory}`;
  }
  return categorySingular[change.category] ?? "API";
}

export function changeTitle(change: DiffChangeItem): string {
  if (change.field === "deprecated") {
    return isDeprecatedChange(change) ? "Marked deprecated" : "Deprecation removed";
  }

  if (change.category === "parameter" && change.subcategory && !change.field) {
    return `${humanize(change.subcategory)} parameter ${change.changeType}`;
  }

  if (change.field) {
    const label = fieldLabel(change.field);
    if (change.changeType === "added") {
      return `${label} added`;
    }
    if (change.changeType === "removed") {
      return `${label} removed`;
    }
    return `${label} changed`;
  }

  const noun = categorySingular[change.category] ?? "Item";
  if (change.changeType === "added") {
    return `${noun} added`;
  }
  if (change.changeType === "removed") {
    return `${noun} removed`;
  }
  return `${noun} changed`;
}

export function changeTags(change: DiffChangeItem): string[] {
  const tags = [categoryLabels[change.category] ?? humanize(change.category)];
  if (change.category === "parameter" && change.subcategory) {
    tags.push(humanize(change.subcategory));
  }
  if (isDeprecatedChange(change)) {
    tags.push("Deprecated");
  }
  return tags;
}

export function changeTypeLabel(changeType: string): string {
  if (changeType === "added") {
    return "Added";
  }
  if (changeType === "removed") {
    return "Removed";
  }
  return "Modified";
}

function valueLines(present: boolean, value: unknown): string[] {
  if (!present) {
    return [];
  }
  if (typeof value === "string") {
    return value.split(/\r?\n/);
  }
  if (value === null) {
    return ["null"];
  }
  if (value === undefined) {
    return ["undefined"];
  }
  if (typeof value === "object") {
    const encoded = JSON.stringify(value, null, 2);
    return encoded === undefined ? [String(value)] : encoded.split("\n");
  }
  return [String(value)];
}

function removed(lines: string[]): DiffLine[] {
  return lines.map((text) => ({ kind: "removed" as const, text }));
}

function added(lines: string[]): DiffLine[] {
  return lines.map((text) => ({ kind: "added" as const, text }));
}

function diffLines(oldLines: string[], newLines: string[]): DiffLine[] {
  if (oldLines.length * newLines.length > 90_000) {
    return [...removed(oldLines), ...added(newLines)];
  }

  const rows = oldLines.length;
  const columns = newLines.length;
  const table: Uint32Array[] = Array.from(
    { length: rows + 1 },
    () => new Uint32Array(columns + 1),
  );

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      table[row][column] =
        oldLines[row] === newLines[column]
          ? table[row + 1][column + 1] + 1
          : Math.max(table[row + 1][column], table[row][column + 1]);
    }
  }

  const out: DiffLine[] = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (oldLines[row] === newLines[column]) {
      out.push({ kind: "context", text: oldLines[row] });
      row += 1;
      column += 1;
    } else if (table[row + 1][column] >= table[row][column + 1]) {
      out.push({ kind: "removed", text: oldLines[row] });
      row += 1;
    } else {
      out.push({ kind: "added", text: newLines[column] });
      column += 1;
    }
  }
  while (row < rows) {
    out.push({ kind: "removed", text: oldLines[row] });
    row += 1;
  }
  while (column < columns) {
    out.push({ kind: "added", text: newLines[column] });
    column += 1;
  }
  return out;
}

// Builds a single unified diff for one change: removed lines first, then added
// lines, with unchanged lines kept as context.
export function buildChangeDiff(change: DiffChangeItem): DiffLine[] {
  const before = valueLines(change.oldValuePresent, change.oldValue);
  const after = valueLines(change.newValuePresent, change.newValue);

  if (change.changeType === "added") {
    return added(after.length > 0 ? after : before);
  }
  if (change.changeType === "removed") {
    return removed(before.length > 0 ? before : after);
  }
  return diffLines(before, after);
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
    changeTitle(change),
    changeSubject(change),
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
  return changeSubject(change);
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
        label: categoryLabels[category] ?? humanize(category),
        count: children.reduce((sum, child) => sum + child.count, 0),
        children,
        changes: [],
      };
    });
}
