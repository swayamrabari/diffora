"use client";

import { Boxes, ChevronDown, Route, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SpecOperation, SpecSchema, SpecSummary } from "@/lib/openapi-summary";

const methodClasses: Record<string, string> = {
  GET: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  POST: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  PUT: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  PATCH: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  DELETE: "border-destructive/20 bg-destructive/10 text-destructive",
};

function statusClasses(status: string): string {
  if (status.startsWith("2")) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status.startsWith("3")) {
    return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
  if (status.startsWith("4")) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status.startsWith("5")) {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

function ContentBadges({
  content,
}: {
  content: { contentType: string; schema: string }[];
}) {
  if (content.length === 0) {
    return <span className="text-xs text-muted-foreground">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {content.map((item) => (
        <Badge
          key={`${item.contentType}:${item.schema}`}
          variant="outline"
          className="font-normal"
        >
          {item.contentType} · {item.schema}
        </Badge>
      ))}
    </div>
  );
}

function OperationCard({ operation }: { operation: SpecOperation }) {
  return (
    <Collapsible>
      <Card size="sm" className="overflow-hidden">
        <CollapsibleTrigger className="group flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40">
          <Badge
            variant="outline"
            className={methodClasses[operation.method] ?? "border-border bg-muted/40"}
          >
            {operation.method}
          </Badge>
          <span className="font-mono text-sm font-medium">{operation.path}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {operation.summary ?? ""}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {operation.parameters.length} params · {operation.responses.length} responses
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-3 border-t border-border px-3 py-3">
            {operation.description ? (
              <p className="text-sm text-muted-foreground">{operation.description}</p>
            ) : null}

            <div className="flex flex-wrap gap-2 text-xs">
              {operation.operationId ? (
                <Badge variant="outline" className="font-mono font-normal">
                  {operation.operationId}
                </Badge>
              ) : null}
              {operation.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="font-normal">
                  {tag}
                </Badge>
              ))}
              {operation.security.map((scheme) => (
                <Badge key={scheme} variant="outline" className="font-normal">
                  <Shield className="size-3" />
                  {scheme}
                </Badge>
              ))}
            </div>

            {operation.parameters.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Parameters</h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>In</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operation.parameters.map((parameter) => (
                        <TableRow key={`${parameter.location}:${parameter.name}`}>
                          <TableCell className="font-medium">
                            {parameter.name}
                            {parameter.description ? (
                              <p className="mt-0.5 max-w-xs truncate text-xs font-normal text-muted-foreground">
                                {parameter.description}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {parameter.location}
                          </TableCell>
                          <TableCell>
                            <Badge variant={parameter.required ? "secondary" : "outline"}>
                              {parameter.required ? "required" : "optional"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{parameter.type}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}

            {operation.requestBody ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">Request body</h3>
                  <Badge variant={operation.requestBody.required ? "secondary" : "outline"}>
                    {operation.requestBody.required ? "required" : "optional"}
                  </Badge>
                </div>
                <ContentBadges content={operation.requestBody.content} />
              </div>
            ) : null}

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Responses</h3>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Content</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operation.responses.map((response) => (
                      <TableRow key={response.status}>
                        <TableCell>
                          <Badge variant="outline" className={statusClasses(response.status)}>
                            {response.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs text-muted-foreground">
                          {response.description || "No description"}
                        </TableCell>
                        <TableCell>
                          <ContentBadges content={response.content} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function SchemaCard({ schema }: { schema: SpecSchema }) {
  return (
    <Collapsible>
      <Card size="sm" className="overflow-hidden">
        <CollapsibleTrigger className="group flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40">
          <Boxes className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-mono text-sm font-medium">{schema.name}</span>
          <Badge variant="secondary" className="font-normal">
            {schema.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {schema.properties.length} properties
          </span>
          <ChevronDown className="ms-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-3 border-t border-border px-3 py-3">
            {schema.description ? (
              <p className="text-sm text-muted-foreground">{schema.description}</p>
            ) : null}

            {schema.properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">No properties.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schema.properties.map((property) => (
                      <TableRow key={property.name}>
                        <TableCell className="font-medium">{property.name}</TableCell>
                        <TableCell className="font-mono text-xs">{property.type}</TableCell>
                        <TableCell>
                          <Badge variant={property.required ? "secondary" : "outline"}>
                            {property.required ? "required" : "optional"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs text-muted-foreground">
                          {property.description ??
                            (property.values.length > 0
                              ? property.values.join(", ")
                              : "—")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function SpecExplorer({ summary }: { summary: SpecSummary }) {
  const groups = new Map<string, SpecOperation[]>();
  for (const operation of summary.operations) {
    const tag = operation.tags[0] ?? "Untagged";
    const items = groups.get(tag) ?? [];
    items.push(operation);
    groups.set(tag, items);
  }
  const groupedOperations = Array.from(groups.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Route className="size-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">Endpoints</h2>
          <Badge variant="outline">{summary.operations.length}</Badge>
        </div>

        {groupedOperations.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No endpoints declared.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {groupedOperations.map(([tag, operations]) => (
              <div key={tag} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{tag}</h3>
                  <Badge variant="outline">{operations.length}</Badge>
                </div>
                <div className="space-y-2">
                  {operations.map((operation) => (
                    <OperationCard key={operation.id} operation={operation} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Boxes className="size-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">Schemas</h2>
          <Badge variant="outline">{summary.schemas.length}</Badge>
        </div>

        {summary.schemas.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No component schemas declared.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {summary.schemas.map((schema) => (
              <SchemaCard key={schema.name} schema={schema} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
