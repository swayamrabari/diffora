# Comparison service

A small, stateless Go HTTP service that runs the pinned **oasdiff 1.38.0** binary. It never touches the database. It writes the uploaded YAML/JSON to a temp directory as-is and passes it to oasdiff; there is no converter or metadata layer.

## Run locally

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

`POST /validate` body: `{ "content": "openapi: 3.0.3\n...", "format": "yaml" }`

`POST /diff` body:

```json
{
  "base":   { "content": "...", "format": "yaml" },
  "target": { "content": "...", "format": "yaml" }
}
```

`POST /diff` runs exactly one engine command and returns:

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

Notes:

- Each change has a stable `id`, a category, a change type, and old/new values with presence flags.
- `source` holds focused full-line hunks with old/new line numbers — only the changed lines, no padding. `gap` marks omitted blocks in very large hunks.
- `$ref` operation copies collapse onto their canonical component location before deduplication.
- Changes whose field is `deprecated` are filtered out before the response is built.
- Both inputs must use the same format; mixing YAML and JSON returns `400 FORMAT_MISMATCH`.

## Tests

```powershell
go test ./...
```

Set `OASDIFF_BIN` to also run the real-engine integration test; without it, the integration test is skipped and the unit/HTTP tests still run.

## Deployment

Deploy on a plain Linux host (the app runs it on EC2): install the oasdiff binary, set the env vars from `.env.example`, run the binary under systemd, and put Caddy (or any HTTPS reverse proxy) in front. `SHARED_SECRET` must match `COMPARISON_SHARED_SECRET` in the web app.

The root [README](../README.md#step-2--comparison-service-ec2) has the full step-by-step walkthrough, including the systemd unit and Caddyfile.

## Safety

- Fixed oasdiff arguments, no shell, no user text in arguments.
- `--allow-external-refs=false`; specs with external refs are rejected and mapped to `EXTERNAL_REF_NOT_SUPPORTED`.
- Temp directories are mode `0700`, files are `0600`, removed with `defer`.
- Request/output caps, timeouts, panic recovery, and graceful shutdown.
- Validation findings are sanitized (no file paths, fingerprints, or severity words) before they are returned.
