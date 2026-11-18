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
              { "kind": "added", "newLine": 14, "text": "        tag:" },
              { "kind": "added", "newLine": 15, "text": "          type: string" },
              { "kind": "added", "newLine": 16, "text": "          maxLength: 40" }
            ]
          }
        ]
      }
    }
  ]
}
```

- `changes` is the deduplicated, user-facing diff. Each item has a stable `id`, category, change type, optional path/method/component/field, and old/new values with presence flags.
- `source` contains one or more focused full-line diff hunks with old/new line numbers. New hunks contain only `added`/`removed` lines, with no surrounding padding; `context` remains for older comparisons and `gap` marks omitted large blocks.
- `$ref` operation copies collapse onto their canonical component locations before deduplication.
- JSON pointers are internal only. They are used for deduplication and source mapping but never returned.
- Changes whose field is `deprecated` are filtered out before the response is built.
- There is no changelog, summary, breaking, deprecation, or raw diff output.

Both inputs must use the same format. Mixing YAML and JSON returns `400 FORMAT_MISMATCH`. All results are JSON.

## Tests

```powershell
$env:OASDIFF_BIN = (Resolve-Path ..\tools\oasdiff\v1.38.0\oasdiff.exe).Path
go test ./...
```

Without `OASDIFF_BIN`, the real-engine integration test is skipped; the unit and HTTP contract tests still run.

## Deployment

The service ships as a Docker image. `fly.toml` is ready for Fly.io:

```powershell
# set `app` and `primary_region` in fly.toml first
fly apps create <your-app-name>
fly secrets set SHARED_SECRET="<shared secret>"
fly deploy
```

`SHARED_SECRET` must match `COMPARISON_SHARED_SECRET` in the web app. Keep one machine warm (`auto_stop_machines = "off"`) so comparisons do not pay a cold start. Cloud Run and Render/Railway instructions are in [`../DEPLOYMENT.md`](../DEPLOYMENT.md).

## Safety

- Fixed oasdiff arguments, no shell, no user text in arguments.
- `--allow-external-refs=false`; external refs are rejected by the engine and mapped to `EXTERNAL_REF_NOT_SUPPORTED`.
- Temp directories are mode `0700`; files are `0600` and removed with `defer`.
- Output caps, request caps, timeouts, panic recovery, and graceful shutdown.
- Validation findings are sanitized before they are returned.
