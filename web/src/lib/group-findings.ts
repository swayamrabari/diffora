export type FindingItem = {
  id: string;
  kind: string;
  position: number;
  ruleId: string;
  level: number;
  levelName: string;
  text: string;
  operation: string | null;
  operationId: string | null;
  path: string | null;
  section: string | null;
  line: number | null;
  column: number | null;
  endLine: number | null;
  endColumn: number | null;
};

export type FindingEndpoint = {
  method: string | null;
  path: string;
};

export type FindingGroup = {
  id: string;
  ruleId: string;
  level: number;
  levelName: string;
  text: string;
  variants: string[];
  findings: FindingItem[];
  endpoints: FindingEndpoint[];
  path: string | null;
  operation: string | null;
  section: string | null;
  line: number | null;
  column: number | null;
};

export type FindingTreeNode = {
  id: string;
  label: string;
  count: number;
  children: FindingTreeNode[];
  groups: FindingGroup[];
};

function groupKey(finding: FindingItem, grouped: boolean): string {
  if (!grouped) {
    return `finding:${finding.id}`;
  }
  if (finding.line !== null || finding.column !== null) {
    return `${finding.ruleId}|${finding.level}|${finding.line ?? ""}|${finding.column ?? ""}`;
  }
  return `${finding.ruleId}|${finding.level}|${finding.text}`;
}

export function groupFindings(
  findings: FindingItem[],
  grouped: boolean,
): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();

  for (const finding of findings) {
    const key = groupKey(finding, grouped);
    let group = groups.get(key);
    if (!group) {
      group = {
        id: finding.id,
        ruleId: finding.ruleId,
        level: finding.level,
        levelName: finding.levelName,
        text: finding.text,
        variants: [],
        findings: [],
        endpoints: [],
        path: finding.path,
        operation: finding.operation,
        section: finding.section,
        line: finding.line,
        column: finding.column,
      };
      groups.set(key, group);
    }

    group.findings.push(finding);
    if (!group.variants.includes(finding.text)) {
      group.variants.push(finding.text);
    }
    if (finding.path) {
      const exists = group.endpoints.some(
        (endpoint) =>
          endpoint.method === finding.operation && endpoint.path === finding.path,
      );
      if (!exists) {
        group.endpoints.push({
          method: finding.operation,
          path: finding.path,
        });
      }
    }
  }

  return Array.from(groups.values()).sort((left, right) => {
    return (
      (left.path ?? "").localeCompare(right.path ?? "") ||
      (left.operation ?? "").localeCompare(right.operation ?? "") ||
      left.ruleId.localeCompare(right.ruleId) ||
      left.text.localeCompare(right.text)
    );
  });
}

const methodOrder = new Map(
  ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"].map(
    (method, index) => [method, index],
  ),
);

const sectionLabels: Record<string, string> = {
  paths: "Endpoints",
  components: "Components",
  security: "Security",
  servers: "Servers",
  metadata: "Metadata",
  webhooks: "Webhooks",
  other: "Other",
};

function sectionLabel(section: string | null): string {
  if (!section) {
    return "Other";
  }
  return sectionLabels[section] ?? section;
}

function methodRank(method: string): number {
  return methodOrder.get(method) ?? 99;
}

export function buildFindingTree(groups: FindingGroup[]): FindingTreeNode[] {
  const endpoints = new Map<
    string,
    {
      direct: FindingGroup[];
      methods: Map<string, FindingGroup[]>;
    }
  >();
  const sections = new Map<string, FindingGroup[]>();

  for (const group of groups) {
    if (group.path) {
      let node = endpoints.get(group.path);
      if (!node) {
        node = { direct: [], methods: new Map() };
        endpoints.set(group.path, node);
      }
      const method = group.operation?.toUpperCase();
      if (method) {
        const methodGroups = node.methods.get(method) ?? [];
        methodGroups.push(group);
        node.methods.set(method, methodGroups);
      } else {
        node.direct.push(group);
      }
      continue;
    }

    const label = sectionLabel(group.section);
    const sectionGroups = sections.get(label) ?? [];
    sectionGroups.push(group);
    sections.set(label, sectionGroups);
  }

  const endpointNodes: FindingTreeNode[] = Array.from(endpoints.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, node]) => {
      const methodNodes: FindingTreeNode[] = Array.from(node.methods.entries())
        .sort(([left], [right]) => methodRank(left) - methodRank(right) || left.localeCompare(right))
        .map(([method, methodGroups]) => ({
          id: `method:${path}:${method}`,
          label: method,
          count: methodGroups.length,
          children: [],
          groups: methodGroups,
        }));

      return {
        id: `path:${path}`,
        label: path,
        count: node.direct.length + methodNodes.reduce((sum, child) => sum + child.count, 0),
        children: methodNodes,
        groups: node.direct,
      };
    });

  const sectionNodes: FindingTreeNode[] = Array.from(sections.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, sectionGroups]) => ({
      id: `section:${label}`,
      label,
      count: sectionGroups.length,
      children: [],
      groups: sectionGroups,
    }));

  return [...endpointNodes, ...sectionNodes];
}
