import { parse } from "yaml";

type Dict = Record<string, unknown>;

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const;

export type SpecServer = {
  url: string;
  description: string | null;
};

export type SpecTag = {
  name: string;
  description: string | null;
};

export type SpecParameter = {
  name: string;
  location: string;
  required: boolean;
  type: string;
  description: string | null;
};

export type SpecContent = {
  contentType: string;
  schema: string;
};

export type SpecRequestBody = {
  required: boolean;
  content: SpecContent[];
};

export type SpecResponse = {
  status: string;
  description: string;
  content: SpecContent[];
};

export type SpecOperation = {
  id: string;
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  operationId: string | null;
  tags: string[];
  parameters: SpecParameter[];
  requestBody: SpecRequestBody | null;
  responses: SpecResponse[];
  security: string[];
};

export type SpecSchemaProperty = {
  name: string;
  type: string;
  required: boolean;
  description: string | null;
  values: string[];
};

export type SpecSchema = {
  name: string;
  type: string;
  description: string | null;
  required: string[];
  properties: SpecSchemaProperty[];
};

export type SpecSecurityScheme = {
  name: string;
  type: string;
  scheme: string | null;
  location: string | null;
  parameterName: string | null;
  bearerFormat: string | null;
};

export type SpecSummary = {
  title: string;
  description: string | null;
  apiVersion: string;
  openapiVersion: string;
  servers: SpecServer[];
  tags: SpecTag[];
  counts: {
    paths: number;
    operations: number;
    schemas: number;
    parameters: number;
    requestBodies: number;
    responses: number;
    securitySchemes: number;
  };
  operations: SpecOperation[];
  schemas: SpecSchema[];
  securitySchemes: SpecSecurityScheme[];
  globalSecurity: string[];
};

function isRecord(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function refName(ref: string): string {
  const segments = ref.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? ref;
}

function resolveLocal(root: unknown, ref: unknown): unknown {
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    return null;
  }

  let current: unknown = root;
  for (const raw of ref.slice(2).split("/")) {
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return null;
    }
    if (current === undefined || current === null) {
      return null;
    }
  }
  return current;
}

function deref(root: unknown, value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return value;
  }
  if (isRecord(value) && typeof value.$ref === "string") {
    const resolved = resolveLocal(root, value.$ref);
    if (resolved !== null) {
      return deref(root, resolved, depth + 1);
    }
  }
  return value;
}

function schemaLabel(root: unknown, value: unknown, depth = 0): string {
  if (depth > 4) {
    return "value";
  }
  const schema = deref(root, value);
  if (!isRecord(schema)) {
    return "value";
  }
  if (typeof schema.$ref === "string") {
    return refName(schema.$ref);
  }

  const rawType = schema.type;
  if (Array.isArray(rawType)) {
    return rawType.filter((item): item is string => typeof item === "string").join(" | ");
  }

  const type = asString(rawType);
  if (type === "array") {
    return `array<${schemaLabel(root, schema.items, depth + 1)}>`;
  }
  if (type) {
    const format = asString(schema.format);
    return format ? `${type} (${format})` : type;
  }
  if (isRecord(schema.properties)) {
    return "object";
  }
  if (Array.isArray(schema.allOf)) {
    return "allOf";
  }
  if (Array.isArray(schema.oneOf)) {
    return "oneOf";
  }
  if (Array.isArray(schema.anyOf)) {
    return "anyOf";
  }
  if (Array.isArray(schema.enum)) {
    return "enum";
  }
  return "value";
}

function contentEntries(root: unknown, value: unknown): SpecContent[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).map(([contentType, media]) => {
    const mediaRecord = isRecord(media) ? media : {};
    return {
      contentType,
      schema: schemaLabel(root, mediaRecord.schema),
    };
  });
}

function parameterSummary(root: unknown, value: unknown): SpecParameter | null {
  const parameter = deref(root, value);
  if (!isRecord(parameter)) {
    return null;
  }
  const name = asString(parameter.name);
  const location = asString(parameter.in);
  if (!name || !location) {
    return null;
  }
  return {
    name,
    location,
    required: asBoolean(parameter.required),
    type: schemaLabel(root, parameter.schema ?? parameter.content),
    description: asString(parameter.description),
  };
}

function requestBodySummary(root: unknown, value: unknown): SpecRequestBody | null {
  if (!value) {
    return null;
  }
  const body = deref(root, value);
  if (!isRecord(body)) {
    return null;
  }
  return {
    required: asBoolean(body.required),
    content: contentEntries(root, body.content),
  };
}

function responseSummaries(root: unknown, value: unknown): SpecResponse[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).map(([status, rawResponse]) => {
    const response = deref(root, rawResponse);
    const record = isRecord(response) ? response : {};
    return {
      status,
      description: asString(record.description) ?? "",
      content: contentEntries(root, record.content),
    };
  });
}

function securityNames(value: unknown): string[] {
  const names = new Set<string>();
  for (const requirement of asArray(value)) {
    if (isRecord(requirement)) {
      for (const name of Object.keys(requirement)) {
        names.add(name);
      }
    }
  }
  return Array.from(names);
}

function schemaSummary(root: unknown, name: string, value: unknown): SpecSchema {
  const schema = deref(root, value);
  if (!isRecord(schema)) {
    return { name, type: "value", description: null, required: [], properties: [] };
  }

  const required = stringList(schema.required);
  const properties = isRecord(schema.properties)
    ? Object.entries(schema.properties).map(([propertyName, rawProperty]) => {
        const property = deref(root, rawProperty);
        const record = isRecord(property) ? property : {};
        return {
          name: propertyName,
          type: schemaLabel(root, rawProperty),
          required: required.includes(propertyName),
          description: asString(record.description),
          values: stringList(record.enum),
        };
      })
    : [];

  return {
    name,
    type: schemaLabel(root, schema),
    description: asString(schema.description),
    required,
    properties,
  };
}

function securitySchemeSummaries(root: unknown): SpecSecurityScheme[] {
  const components = isRecord(root) && isRecord(root.components) ? root.components : {};
  const schemes = isRecord(components.securitySchemes) ? components.securitySchemes : {};
  return Object.entries(schemes).map(([name, value]) => {
    const scheme = deref(root, value);
    const record = isRecord(scheme) ? scheme : {};
    return {
      name,
      type: asString(record.type) ?? "unknown",
      scheme: asString(record.scheme),
      location: asString(record.in),
      parameterName: asString(record.name),
      bearerFormat: asString(record.bearerFormat),
    };
  });
}

export function summarizeSpec(content: string): SpecSummary | null {
  let root: unknown;
  try {
    root = parse(content);
  } catch {
    return null;
  }
  if (!isRecord(root)) {
    return null;
  }

  const info = isRecord(root.info) ? root.info : {};
  const paths = isRecord(root.paths) ? root.paths : {};
  const components = isRecord(root.components) ? root.components : {};
  const globalSecurity = securityNames(root.security);
  const operations: SpecOperation[] = [];

  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = deref(root, rawPathItem);
    if (!isRecord(pathItem)) {
      continue;
    }
    const sharedParameters = asArray(pathItem.parameters);

    for (const method of HTTP_METHODS) {
      const rawOperation = pathItem[method];
      if (!isRecord(rawOperation)) {
        continue;
      }

      const parameters = [...sharedParameters, ...asArray(rawOperation.parameters)]
        .map((parameter) => parameterSummary(root, parameter))
        .filter((parameter): parameter is SpecParameter => parameter !== null);

      const uniqueParameters = Array.from(
        new Map(parameters.map((parameter) => [`${parameter.location}:${parameter.name}`, parameter])).values(),
      );
      const tags = stringList(rawOperation.tags);
      const operationSecurity =
        rawOperation.security === undefined ? globalSecurity : securityNames(rawOperation.security);

      operations.push({
        id: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        summary: asString(rawOperation.summary),
        description: asString(rawOperation.description),
        operationId: asString(rawOperation.operationId),
        tags: tags.length > 0 ? tags : ["Untagged"],
        parameters: uniqueParameters,
        requestBody: requestBodySummary(root, rawOperation.requestBody),
        responses: responseSummaries(root, rawOperation.responses),
        security: operationSecurity,
      });
    }
  }

  operations.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
  );

  const schemaSection = isRecord(components.schemas) ? components.schemas : {};
  const schemas = Object.entries(schemaSection)
    .map(([name, schema]) => schemaSummary(root, name, schema))
    .sort((left, right) => left.name.localeCompare(right.name));

  const tags = asArray(root.tags)
    .map((tag) => {
      if (!isRecord(tag)) {
        return null;
      }
      const name = asString(tag.name);
      return name ? { name, description: asString(tag.description) } : null;
    })
    .filter((tag): tag is SpecTag => tag !== null);

  const servers = asArray(root.servers)
    .map((server) => {
      if (!isRecord(server)) {
        return null;
      }
      const url = asString(server.url);
      return url ? { url, description: asString(server.description) } : null;
    })
    .filter((server): server is SpecServer => server !== null);

  const securitySchemes = securitySchemeSummaries(root);

  return {
    title: asString(info.title) ?? "Untitled API",
    description: asString(info.description),
    apiVersion: asString(info.version) ?? "",
    openapiVersion: asString(root.openapi) ?? "",
    servers,
    tags,
    counts: {
      paths: Object.keys(paths).length,
      operations: operations.length,
      schemas: schemas.length,
      parameters: isRecord(components.parameters) ? Object.keys(components.parameters).length : 0,
      requestBodies: isRecord(components.requestBodies)
        ? Object.keys(components.requestBodies).length
        : 0,
      responses: isRecord(components.responses) ? Object.keys(components.responses).length : 0,
      securitySchemes: securitySchemes.length,
    },
    operations,
    schemas,
    securitySchemes,
    globalSecurity,
  };
}
