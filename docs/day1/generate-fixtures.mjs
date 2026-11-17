import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const pairsRoot = path.join(repoRoot, "comparison-service", "testdata", "pairs");

const clone = (value) => JSON.parse(JSON.stringify(value));

const base = {
  openapi: "3.0.3",
  info: {
    title: "Pets API",
    version: "1.0.0",
    description: "A small pets API used for fixture testing.",
  },
  servers: [{ url: "https://api.example.com" }],
  security: [{ apiKey: [] }],
  tags: [{ name: "pets", description: "Pet operations" }],
  paths: {
    "/pets": {
      get: {
        tags: ["pets"],
        summary: "List pets",
        description: "Returns all pets.",
        operationId: "listPets",
        parameters: [
          { $ref: "#/components/parameters/Limit" },
          {
            name: "sort",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["name", "id"] },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            headers: {
              "X-Rate-Limit": { schema: { type: "integer" } },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pets" },
              },
            },
          },
          "400": { description: "Bad request" },
        },
      },
      post: {
        tags: ["pets"],
        summary: "Create a pet",
        operationId: "createPet",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PetInput" },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
        },
      },
    },
    "/pets/{petId}": {
      parameters: [
        {
          name: "petId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      get: {
        tags: ["pets"],
        summary: "Get a pet",
        operationId: "getPet",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["pets"],
        summary: "Delete a pet",
        operationId: "deletePet",
        responses: {
          "204": { description: "Deleted" },
        },
      },
    },
  },
  components: {
    parameters: {
      Limit: {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer" },
      },
    },
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
      },
    },
    schemas: {
      PetBase: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
        },
      },
      PetInput: {
        allOf: [{ $ref: "#/components/schemas/PetBase" }],
      },
      Pet: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          status: { type: "string", enum: ["available", "sold"] },
        },
      },
      Pets: {
        type: "array",
        items: { $ref: "#/components/schemas/Pet" },
      },
    },
  },
};

const fixture = (name, target, options = {}) => ({
  name,
  base: options.base ?? clone(base),
  target,
  rawBase: options.rawBase,
  rawTarget: options.rawTarget,
  extraFiles: options.extraFiles,
});

const fixtures = [];

fixtures.push(fixture("identical", clone(base)));

fixtures.push(
  fixture("endpoint-added", (() => {
    const target = clone(base);
    target.paths["/owners"] = {
      get: {
        summary: "List owners",
        operationId: "listOwners",
        responses: { "200": { description: "OK" } },
      },
    };
    return target;
  })()),
);

fixtures.push(
  fixture("endpoint-removed", (() => {
    const target = clone(base);
    delete target.paths["/pets/{petId}"];
    return target;
  })()),
);

fixtures.push(
  fixture("operation-removed", (() => {
    const target = clone(base);
    delete target.paths["/pets"].post;
    return target;
  })()),
);

fixtures.push(
  fixture("operation-metadata", (() => {
    const target = clone(base);
    const operation = target.paths["/pets"].get;
    operation.operationId = "listAllPets";
    operation.tags = ["pets", "catalog"];
    operation.deprecated = true;
    return target;
  })()),
);

fixtures.push(
  fixture("query-param-added", (() => {
    const target = clone(base);
    target.paths["/pets"].get.parameters.push({
      name: "filter",
      in: "query",
      required: false,
      schema: { type: "string" },
    });
    return target;
  })()),
);

fixtures.push(
  fixture("param-max-added", (() => {
    const target = clone(base);
    target.components.parameters.Limit.schema.maximum = 50;
    return target;
  })()),
);

const paramMinBase = clone(base);
paramMinBase.components.parameters.Limit.schema.minimum = 1;
const paramMinTarget = clone(paramMinBase);
paramMinTarget.components.parameters.Limit.schema.minimum = 2;
fixtures.push(
  fixture("param-min-changed", paramMinTarget, { base: paramMinBase }),
);

fixtures.push(
  fixture("param-reordered", (() => {
    const target = clone(base);
    target.paths["/pets"].get.parameters.reverse();
    return target;
  })()),
);

fixtures.push(
  fixture("property-added", (() => {
    const target = clone(base);
    target.components.schemas.Pet.properties.tag = { type: "string" };
    return target;
  })()),
);

fixtures.push(
  fixture("property-removed", (() => {
    const target = clone(base);
    delete target.components.schemas.Pet.properties.status;
    return target;
  })()),
);

fixtures.push(
  fixture("required-added", (() => {
    const target = clone(base);
    target.components.schemas.Pet.required.push("status");
    return target;
  })()),
);

fixtures.push(
  fixture("enum-value-added", (() => {
    const target = clone(base);
    target.components.schemas.Pet.properties.status.enum.push("pending");
    return target;
  })()),
);

fixtures.push(
  fixture("type-changed", (() => {
    const target = clone(base);
    target.components.schemas.Pet.properties.id.type = "integer";
    return target;
  })()),
);

fixtures.push(
  fixture("response-schema-changed", (() => {
    const target = clone(base);
    target.paths["/pets"].get.responses["200"].content["application/json"].schema = {
      $ref: "#/components/schemas/Pet",
    };
    return target;
  })()),
);

fixtures.push(
  fixture("response-added", (() => {
    const target = clone(base);
    target.paths["/pets"].get.responses["404"] = { description: "Not found" };
    return target;
  })()),
);

fixtures.push(
  fixture("response-header-changed", (() => {
    const target = clone(base);
    target.paths["/pets"].get.responses["200"].headers["X-Rate-Limit"].schema.type = "string";
    return target;
  })()),
);

fixtures.push(
  fixture("request-body-required", (() => {
    const target = clone(base);
    target.paths["/pets"].post.requestBody.required = false;
    return target;
  })()),
);

fixtures.push(
  fixture("shared-schema", (() => {
    const target = clone(base);
    target.components.schemas.Pet.properties.nickname = { type: "string" };
    return target;
  })()),
);

fixtures.push(
  fixture("transitive-usage", (() => {
    const target = clone(base);
    target.components.schemas.Pet.properties.status.enum.push("reserved");
    return target;
  })()),
);

fixtures.push(
  fixture("allof-usage", (() => {
    const target = clone(base);
    target.components.schemas.PetBase.properties.age = { type: "integer" };
    return target;
  })()),
);

fixtures.push(
  fixture("description-only", (() => {
    const target = clone(base);
    target.info.description = "A small pets API with an updated description.";
    return target;
  })()),
);

fixtures.push(
  fixture("operation-description", (() => {
    const target = clone(base);
    target.paths["/pets"].get.summary = "List all pets";
    return target;
  })()),
);

fixtures.push(
  fixture("security-changed", (() => {
    const target = clone(base);
    target.components.securitySchemes.bearer = {
      type: "http",
      scheme: "bearer",
    };
    target.security = [{ bearer: [] }];
    return target;
  })()),
);

fixtures.push(
  fixture("server-changed", (() => {
    const target = clone(base);
    target.servers = [{ url: "https://api2.example.com" }];
    return target;
  })()),
);

const base31 = clone(base);
base31.openapi = "3.1.0";
const target31 = clone(base31);
target31.components.schemas.Pet.properties.microchip = { type: "string" };
fixtures.push(fixture("openapi-31", target31, { base: base31 }));

const webhookBase = clone(base);
webhookBase.openapi = "3.1.0";
const webhookTarget = clone(webhookBase);
webhookTarget.webhooks = {
  newPet: {
    post: {
      summary: "Pet created",
      requestBody: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Pet" },
          },
        },
      },
      responses: { "200": { description: "OK" } },
    },
  },
};
fixtures.push(fixture("webhook-added", webhookTarget, { base: webhookBase }));

fixtures.push(
  fixture("yaml-quirks", null, {
    rawBase: `openapi: 3.0.3
info:
  title: Quirks API
  version: 1.0.0
  x-date: 2024-01-01
  x-flag: on
  x-yes: yes
paths:
  /quirks:
    get:
      responses:
        200:
          description: OK
`,
    rawTarget: `openapi: 3.0.3
info:
  title: Quirks API
  version: 1.0.0
  x-date: 2024-02-02
  x-flag: off
  x-yes: no
paths:
  /quirks:
    get:
      responses:
        200:
          description: OK
`,
  }),
);

fixtures.push(
  fixture("yaml-anchors", null, {
    rawBase: `openapi: 3.0.3
info:
  title: Anchors API
  version: 1.0.0
x-defaults: &str
  type: string
paths:
  /anchors:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: *str
                  name: *str
`,
    rawTarget: `openapi: 3.0.3
info:
  title: Anchors API
  version: 1.0.0
x-defaults: &str
  type: string
paths:
  /anchors:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: *str
                  name: *str
                  tag: *str
`,
  }),
);

fixtures.push(
  fixture("external-ref", null, {
    rawBase: `openapi: 3.0.3
info:
  title: External Ref API
  version: 1.0.0
paths:
  /external:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: './other.yaml#/components/schemas/Other'
`,
    rawTarget: `openapi: 3.0.3
info:
  title: External Ref API
  version: 1.0.0
paths:
  /external:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: './other.yaml#/components/schemas/Other'
`,
    extraFiles: {
      "other.yaml": `components:
  schemas:
    Other:
      type: object
      properties:
        value:
          type: string
`,
    },
  }),
);

fixtures.push(
  fixture("invalid-target", null, {
    rawBase: JSON.stringify(base, null, 2) + "\n",
    rawTarget: "openapi: [\n",
  }),
);

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

for (const entry of fixtures) {
  const { name, base: baseSpec, target, rawBase, rawTarget, extraFiles } = entry;
  const dir = path.join(pairsRoot, name);
  ensureDir(dir);

  const baseText = rawBase ?? JSON.stringify(baseSpec, null, 2) + "\n";
  const targetText = rawTarget ?? JSON.stringify(target, null, 2) + "\n";

  fs.writeFileSync(path.join(dir, "base.yaml"), baseText, "utf8");
  fs.writeFileSync(path.join(dir, "target.yaml"), targetText, "utf8");

  for (const [filename, content] of Object.entries(extraFiles ?? {})) {
    fs.writeFileSync(path.join(dir, filename), content, "utf8");
  }
}

console.log(`Wrote ${fixtures.length} fixture pairs to ${pairsRoot}`);
