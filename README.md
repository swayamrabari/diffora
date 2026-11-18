# Diffora

Diffora compares two versions of an OpenAPI specification and shows what changed. It reports changes; it does not judge whether they are safe or breaking.

The full build specification is in [`DIFFORA.md`](./DIFFORA.md). Engine findings are in [`docs/notes.md`](./docs/notes.md), and build decisions are in [`docs/decisions.md`](./docs/decisions.md).

## Status

Phase 0 is complete:

- Root git repository and `.gitignore` / `.dockerignore`.
- `comparison-service/` (renamed from the misspelled scaffold folder) with a Go module.
- Next.js app moved to `web/src/app` with the v2 config.
- oasdiff pinned to **1.38.0** with verified checksums.
- 31 fixture pairs generated and validated; raw expected diffs saved.
- Foundation docs and env examples created.

Phase 1 is complete:

- Go HTTP service with `/health`, `/validate`, and `/diff`.
- `/diff` runs `diff`, `changelog`, `summary`, and `breaking` against the pinned engine.
- Uploaded YAML/JSON is passed to oasdiff as-is; there is no YAML converter or metadata layer.
- Both compared versions must use the same format; mixing YAML and JSON returns `400 FORMAT_MISMATCH`.
- Deprecations are extracted from the diff.
- Shared-secret auth, body limits, timeouts, output caps, panic recovery, and graceful shutdown.
- Unit tests, HTTP contract tests, and a pinned-engine integration test.
- Pinned Dockerfile with checksum verification and non-root runtime.
- Docker image build was not executed in this environment because the Docker daemon is not running.

Phase 2 is complete:

- Prisma 7 schema and initial migration for `User`, `Project`, `ApiVersion`, `Comparison`, `ComparisonFinding`, and `ComparisonDeprecation`.
- Prisma 7 PostgreSQL adapter and lazy DB client.
- Environment validation.
- Register/login/logout/me API routes with bcrypt and JWT cookies.
- Next 16 `proxy.ts` route protection.
- Login/register pages, protected app layout, top bar, dashboard shell, error/not-found pages.
- Build and auth-shell smoke tests pass without a database.
- The migration has not been applied because Supabase credentials have not been added yet.

Phase 3 is complete:

- Project CRUD API and ownership checks.
- Dashboard project list with create, edit, and delete.
- Project page with version and comparison tables.
- YAML/JSON version upload with size, extension, UTF-8, OpenAPI version, label, checksum, and engine validation.
- Raw version viewer and protected raw API.
- Version page with metadata, raw spec, and related comparisons.

Phase 4 is complete:

- `POST /api/projects/:projectId/comparisons` with ownership, same-version, cross-project, and same-format checks.
- Calls the Go `/diff` endpoint and validates its response.
- Stores `Comparison`, `ComparisonFinding` rows for changelog and breaking, `ComparisonDeprecation` rows, `summary`, and `rawDiffText` in one transaction.
- Failed comparisons are stored and returned with `details.comparisonId`.
- Read APIs: comparison detail, filtered/paginated findings, deprecations, JSON export, and delete.
- Compare dialog on the project page with version selection, format mismatch warning, and failed-comparison navigation.
- Minimal comparison page with counts, summary, first changelog page, deprecations, export, and delete.
- Full end-to-end test against Supabase: **109 changelog, 31 breaking, 1 deprecation**, filters and export verified.

Phase 5 workspace is complete except the Source diff tab:

- The Go service now returns a deduplicated `changes` array built from the raw diff.
- `ComparisonDiffChange` rows store category, change type, parameter location/response code/header, path, method, component, field, pointers, old/new values, and presence flags.
- Changes tab is type-first: Endpoints, Operations, Parameters, Requests, Responses, Headers, Schemas, Security, Servers, Metadata, Webhooks.
- Group by type or endpoint; filter by type, change type, method, and free text.
- Before/After panels show `-` and `+` values with copy buttons.
- Duplicate operation copies collapse onto component pointers; the test pair stores **73 unique structured changes** across 109 changelog findings.
- Breaking tab keeps source-location grouping (31 findings → 14 groups).
- Summary tab shows structured counts, raw findings, levels, sections, and by-type bars.
- Deprecations tab uses readable labels and old/new values.
- Existing comparisons created before this migration show a “re-run” notice because they have no structured rows.

Remaining: Source diff tab, final E2E, security hardening, and packaging.

## Stack

- Next.js 16.4.6, React 19.3.0, TypeScript
- Tailwind CSS 4, shadcn/ui
- Prisma + Supabase PostgreSQL
- Go comparison service running oasdiff
- Docker Compose for the local stack

## Repository layout

```text
Diffora/
├── DIFFORA.md
├── README.md
├── docker-compose.yml              # added in Phase 6
├── docs/
│   ├── notes.md
│   ├── decisions.md
│   └── day1/                       # seed specs, scratch outputs, fixture generator
├── comparison-service/
│   ├── go.mod
│   ├── testdata/pairs/             # 31 fixture pairs
│   └── ...                         # Go service added in Phase 1
└── web/
    ├── src/app/                    # Next.js App Router
    ├── prisma/                     # added in Phase 2
    ├── .env.example
    └── next.config.ts
```

## Prerequisites

- Node.js 22 LTS and npm
- Go 1.27.x
- Docker (for later phases)
- A Supabase project (for later phases)
- oasdiff **1.38.0**

## Pin and verify oasdiff

The local binary is not committed. Download the release for your platform and verify it against the published checksums:

```powershell
$version = "1.38.0"
$dir = "tools/oasdiff/v$version"
New-Item -ItemType Directory -Force $dir | Out-Null
$base = "https://github.com/oasdiff/oasdiff/releases/download/v$version"
Invoke-WebRequest "$base/checksums.txt" -OutFile "$dir/checksums.txt"
Invoke-WebRequest "$base/oasdiff_${version}_windows_amd64.tar.gz" -OutFile "$dir/oasdiff_${version}_windows_amd64.tar.gz"
Get-FileHash "$dir/oasdiff_${version}_windows_amd64.tar.gz" -Algorithm SHA256
tar -xzf "$dir/oasdiff_${version}_windows_amd64.tar.gz" -C $dir
```

Expected Windows amd64 SHA-256:

```text
4509a5d838849ab39c759b6ed95a0b9193b80a69e55b88c6c9e72d7bde21bbcf
```

Set `OASDIFF_BIN` to the extracted binary when running the service locally. The Go Dockerfile will download and verify the Linux binary in Phase 6.

## Validate the fixtures

```powershell
node docs/day1/generate-fixtures.mjs
$o = (Resolve-Path .\tools\oasdiff\v1.38.0\oasdiff.exe).Path
& $o validate .\comparison-service\testdata\pairs\property-added\base.yaml -f json --allow-external-refs=false
& $o validate .\comparison-service\testdata\pairs\property-added\target.yaml -f json --allow-external-refs=false
& $o diff .\comparison-service\testdata\pairs\property-added\base.yaml .\comparison-service\testdata\pairs\property-added\target.yaml -f json --allow-external-refs=false
```

Expected error fixtures:

- `external-ref` — exit `123` because external refs are disabled.
- `invalid-target` — exit `102` because the target does not load.

## Environment files

Copy the examples when the relevant phase needs them:

```powershell
Copy-Item web/.env.example web/.env.local
Copy-Item comparison-service/.env.example comparison-service/.env
```

Do not commit `.env` files. Use real secrets and real Supabase connection strings.

## Running the comparison service locally

```powershell
cd comparison-service
$env:SHARED_SECRET = "local-secret"
$env:OASDIFF_BIN = (Resolve-Path ..\tools\oasdiff\v1.38.0\oasdiff.exe).Path
$env:PORT = "8080"
go run ./cmd/server
```

Check it:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health
```

The service tests include a real-engine integration test when `OASDIFF_BIN` is set:

```powershell
$env:OASDIFF_BIN = (Resolve-Path ..\tools\oasdiff\v1.38.0\oasdiff.exe).Path
go test ./...
```

## Supabase setup

1. Copy the web environment file:

   ```powershell
   Copy-Item web\.env.example web\.env.local
   ```

2. Fill `web\.env.local`:

   ```dotenv
   DATABASE_URL=postgresql://...pooler...:6543/postgres?sslmode=require
   DIRECT_URL=postgresql://...direct-or-session-pooler...:5432/postgres?sslmode=require
   JWT_SECRET=at-least-32-random-bytes
   COOKIE_SECURE=false
   APP_ORIGIN=http://localhost:3000
   COMPARISON_SERVICE_URL=http://localhost:8080
   COMPARISON_SHARED_SECRET=test-secret
   ```

   Use the Supabase **pooled** URL for `DATABASE_URL` (runtime) and the **direct** or **session pooler** URL for `DIRECT_URL` (migrations).

3. Apply the initial migration:

   ```powershell
   cd web
   npm run db:deploy
   ```

4. Start the comparison service in another terminal:

   ```powershell
   cd comparison-service
   $env:SHARED_SECRET = "test-secret"
   $env:OASDIFF_BIN = (Resolve-Path ..\tools\oasdiff\v1.38.0\oasdiff.exe).Path
   $env:PORT = "8080"
   go run ./cmd/server
   ```

   `COMPARISON_SHARED_SECRET` in `web/.env.local` must match `SHARED_SECRET`.

5. Start the web app:

   ```powershell
   cd web
   npm run dev
   ```

6. Open `http://localhost:3000/register` and create an account.

`prisma7.config.ts` loads `.env.local` for Prisma CLI commands. The runtime Prisma client uses `DATABASE_URL` through the Prisma 7 PG adapter.

## Version upload rules

- Accepted files: `.yaml`, `.yml`, `.json`.
- Maximum file size: 2 MB.
- The file must be valid UTF-8 and OpenAPI 3.0.x or 3.1.x.
- The comparison service must be running; the upload calls `/validate`.
- Version labels are unique per project, case-insensitive.
- The original text is stored unchanged.

## Comparisons

With at least two versions uploaded, use **Compare** on the project page.

- Both versions must use the same format (YAML/YAML or JSON/JSON).
- The comparison calls the Go `/diff` endpoint.
- Results are stored immediately; reopening does not call the Go service.
- Failed comparisons are saved and can be opened by id.
- The comparison page supports export and delete.
- Changes tab uses the structured, deduplicated diff with before/after values.
- Breaking and Deprecations tabs use the stored changelog/deprecation rows.
- Source diff is the remaining Phase 5 item.

## Next steps

1. **Phase 5 remainder:** Source diff tab and E2E coverage.
2. **Phase 6:** Security hardening, Docker Compose, README completion.

## Security notes

- oasdiff runs with `--allow-external-refs=false`.
- The comparison service uses a shared secret and is not published in Compose.
- The session cookie is HttpOnly, SameSite=Lax, and `Secure` only when `COOKIE_SECURE=true`.
- Spec content, cookies, secrets, and emails must never be logged.
