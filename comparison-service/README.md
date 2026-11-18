# Comparison service

Stateless Go HTTP service that runs the pinned oasdiff binary. It never touches the database. It writes the uploaded YAML/JSON as-is and passes it to oasdiff; there is no converter or metadata layer.

## Run

```powershell
$env:SHARED_SECRET = "local-secret"
$env:OASDIFF_BIN = (Resolve-Path ..\tools\oasdiff\v1.38.0\oasdiff.exe).Path
$env:PORT = "8080"
go run ./cmd/server
```

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | `{ "status": "ok", "engineVersion": "1.38.0" }` |
| POST | `/validate` | `X-Shared-Secret` | Validate one YAML/JSON spec |
| POST | `/diff` | `X-Shared-Secret` | Return one deduplicated `changes` array |

`POST /validate` body:

```json
{ "content": "openapi: 3.0.3\n...", "format": "yaml" }
```

`POST /diff` body:

```json
{
  "base":   { "content": "...", "format": "yaml" },
  "target": { "content": "...", "format": "yaml" }
}
```

`POST /diff` runs exactly one engine command:

```text
oasdiff diff base.<yaml|json> target.<yaml|json> -f json --allow-external-refs=false
```

`POST /diff` response:

```json
{
  "engineVersion": "1.38.0",
  "durationMs": 412,
  "changes": [
    {
      "id": "c0",
      "category": "schema",
      "changeType": "added",
      "subcategory": null,
      "path": null,
      "method": null,
      "component": "NewPet",
      "field": "tag",
      "newValue": { "maxLength": 40, "type": "string" },
      "oldValuePresent": false,
      "newValuePresent": true,
      "source": {
        "hunks": [
          {
            "lines": [
              { "kind": "context", "newLine": 12, "text": "        name:" },
              { "kind": "context", "newLine": 13, "text": "          type: string" },
              { "kind": "added", "newLine": 14, "text": "        tag:" },
              { "kind": "added", "newLine": 15, "text": "          type: string" },
              { "kind": "added", "newLine": 16, "text": "          maxLength: 40" },
              { "kind": "context", "newLine": 17, "text": "        status:" }
            ]
          }
        ]
      }
    }
  ]
}
```

- `changes` is the deduplicated, user-facing diff. Each item has a stable `id`, category, change type, optional path/method/component/field, and old/new values with presence flags.
- `source` contains one or more full-line diff hunks with old/new line numbers and 3 lines of context above and below. Lines are `context`, `added`, `removed`, or `gap`.
- `$ref` operation copies collapse onto their canonical component locations before deduplication.
- JSON pointers are internal only. They are used for deduplication and source mapping but never returned.
- There is no changelog, summary, breaking, deprecation, or raw diff output.

Both inputs must use the same format. Mixing YAML and JSON returns `400 FORMAT_MISMATCH`. All results are JSON.

## Tests

```powershell
$env:OASDIFF_BIN = (Resolve-Path ..\tools\oasdiff\v1.38.0\oasdiff.exe).Path
go test ./...
```

Without `OASDIFF_BIN`, the real-engine integration test is skipped; the unit and HTTP contract tests still run.

## Safety

- Fixed oasdiff arguments, no shell, no user text in arguments.
- `--allow-external-refs=false`; external refs are rejected by the engine and mapped to `EXTERNAL_REF_NOT_SUPPORTED`.
- Temp directories are mode `0700`; files are `0600` and removed with `defer`.
- Output caps, request caps, timeouts, panic recovery, and graceful shutdown.
- Validation findings are sanitized before they are returned.
