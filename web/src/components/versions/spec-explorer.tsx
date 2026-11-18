"use client";

import { useMemo, useState } from "react";
import {
  Boxes,
  ChevronDown,
  Info,
  Route,
  Search,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  SpecOperation,
  SpecSchema,
  SpecSecurityScheme,
  SpecSummary,
} from "@/lib/openapi-summary";

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-medium">{children}</h3>;
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
        <CollapsibleTrigger className="group flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40">
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
          <div className="space-y-5 border-t border-border px-4 py-4">
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
                <SectionTitle>Parameters</SectionTitle>
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
                  <SectionTitle>Request body</SectionTitle>
                  <Badge variant={operation.requestBody.required ? "secondary" : "outline"}>
                    {operation.requestBody.required ? "required" : "optional"}
                  </Badge>
                </div>
                <ContentBadges content={operation.requestBody.content} />
              </div>
            ) : null}

            <div className="space-y-2">
              <SectionTitle>Responses</SectionTitle>
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
        <CollapsibleTrigger className="group flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40">
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
          <div className="space-y-4 border-t border-border px-4 py-4">
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

function SecurityCard({ scheme }: { scheme: SpecSecurityScheme }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{scheme.name}</span>
          <Badge variant="secondary">{scheme.type}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {scheme.scheme ? <Badge variant="outline">{scheme.scheme}</Badge> : null}
        {scheme.location ? <Badge variant="outline">in {scheme.location}</Badge> : null}
        {scheme.parameterName ? (
          <Badge variant="outline">{scheme.parameterName}</Badge>
        ) : null}
        {scheme.bearerFormat ? (
          <Badge variant="outline">{scheme.bearerFormat}</Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SpecExplorer({ summary }: { summary: SpecSummary }) {
  const [routeQuery, setRouteQuery] = useState("");
  const [schemaQuery, setSchemaQuery] = useState("");

  const filteredOperations = useMemo(() => {
    const needle = routeQuery.trim().toLowerCase();
    if (!needle) {
      return summary.operations;
    }
    return summary.operations.filter((operation) =>
      [
        operation.method,
        operation.path,
        operation.summary,
        operation.operationId,
        operation.tags.join(" "),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [routeQuery, summary.operations]);

  const groupedOperations = useMemo(() => {
    const groups = new Map<string, SpecOperation[]>();
    for (const operation of filteredOperations) {
      const tag = operation.tags[0] ?? "Untagged";
      const items = groups.get(tag) ?? [];
      items.push(operation);
      groups.set(tag, items);
    }
    return Array.from(groups.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [filteredOperations]);

  const filteredSchemas = useMemo(() => {
    const needle = schemaQuery.trim().toLowerCase();
    if (!needle) {
      return summary.schemas;
    }
    return summary.schemas.filter((schema) =>
      [schema.name, schema.type, schema.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [schemaQuery, summary.schemas]);

  return (
    <Tabs defaultValue="overview" className="gap-6">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="overview" className="flex-none">
          <Info />
          Overview
        </TabsTrigger>
        <TabsTrigger value="routes" className="flex-none">
          <Route />
          Routes
        </TabsTrigger>
        <TabsTrigger value="schemas" className="flex-none">
          <Boxes />
          Schemas
        </TabsTrigger>
        <TabsTrigger value="security" className="flex-none">
          <Shield />
          Security
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Operations" value={summary.counts.operations} />
          <Stat label="Schemas" value={summary.counts.schemas} />
          <Stat label="Security schemes" value={summary.counts.securitySchemes} />
          <Stat label="Paths" value={summary.counts.paths} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Servers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.servers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No servers declared.</p>
              ) : (
                summary.servers.map((server) => (
                  <div key={server.url} className="rounded-lg border border-border p-3">
                    <p className="break-all font-mono text-xs">{server.url}</p>
                    {server.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {server.description}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {summary.tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags declared.</p>
              ) : (
                summary.tags.map((tag) => (
                  <Badge key={tag.name} variant="outline" title={tag.description ?? undefined}>
                    {tag.name}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Component parameters" value={summary.counts.parameters} />
          <Stat label="Component request bodies" value={summary.counts.requestBodies} />
          <Stat label="Component responses" value={summary.counts.responses} />
        </div>
      </TabsContent>

      <TabsContent value="routes" className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={routeQuery}
            onChange={(event) => setRouteQuery(event.target.value)}
            placeholder="Search routes by path, method, tag, or summary…"
            className="pl-9"
          />
        </div>

        {groupedOperations.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No routes match your search.
            </CardContent>
          </Card>
        ) : (
          groupedOperations.map(([tag, operations]) => (
            <section key={tag} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{tag}</h3>
                <Badge variant="outline">{operations.length}</Badge>
              </div>
              <div className="space-y-2">
                {operations.map((operation) => (
                  <OperationCard key={operation.id} operation={operation} />
                ))}
              </div>
            </section>
          ))
        )}
      </TabsContent>

      <TabsContent value="schemas" className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={schemaQuery}
            onChange={(event) => setSchemaQuery(event.target.value)}
            placeholder="Search schemas…"
            className="pl-9"
          />
        </div>

        {filteredSchemas.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {summary.schemas.length === 0
                ? "No component schemas declared."
                : "No schemas match your search."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredSchemas.map((schema) => (
              <SchemaCard key={schema.name} schema={schema} />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="security" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Global security</CardTitle>
            <CardDescription>
              Applied unless an operation overrides its own requirements.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {summary.globalSecurity.length === 0 ? (
              <span className="text-sm text-muted-foreground">No global security.</span>
            ) : (
              summary.globalSecurity.map((name) => (
                <Badge key={name} variant="outline">
                  <Shield className="size-3" />
                  {name}
                </Badge>
              ))
            )}
          </CardContent>
        </Card>

        {summary.securitySchemes.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No security schemes declared.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {summary.securitySchemes.map((scheme) => (
              <SecurityCard key={scheme.name} scheme={scheme} />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
