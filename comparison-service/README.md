# Comparison service

Stateless Go HTTP service that runs the pinned oasdiff binary. It never touches the database. It is a thin proxy: the uploaded YAML/JSON is written as-is and passed to oasdiff; there is no YAML converter or metadata layer.

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
| POST | `/diff` | `X-Shared-Secret` | Return raw diff + changelog + summary + breaking + deprecations |

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

`POST /diff` response:

```json
{
  "engineVersion": "1.38.0",
  "durationMs": 412,
  "rawDiffText": "{\"info\":...}",
  "changelog": [],
  "summary": { "diff": true, "details": {} },
  "breaking": [],
  "deprecations": [],
  "changes": []
}
```

`changes` is the structured, deduplicated diff built from the raw diff. Each item has a category, change type, path/method/component, field, base/target pointers, and old/new values. Operation copies are resolved through `$ref` to their component pointers and deduplicated.

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
- File paths and engine fingerprints are stripped from public findings.
