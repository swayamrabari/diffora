# Diffora

Diffora compares two versions of an OpenAPI specification and shows what changed. It reports changes; it does not judge whether they are safe or breaking.

The full build specification is in [`DIFFORA.md`](./DIFFORA.md). Engine findings are in [`docs/notes.md`](./docs/notes.md), and build decisions are in [`docs/decisions.md`](./docs/decisions.md).

## Status

The app is complete end to end:

- Go HTTP service with `/health`, `/validate`, and `/diff`, pinned to oasdiff **1.38.0** with verified checksums.
- `/diff` runs exactly one `oasdiff diff` command and returns one deduplicated `changes` array.
- Uploaded YAML/JSON is passed to oasdiff as-is; there is no YAML converter or metadata layer.
- Both compared versions must use the same format; mixing YAML and JSON returns `400 FORMAT_MISMATCH`.
- Shared-secret auth, body limits, timeouts, output caps, panic recovery, and graceful shutdown.
- Prisma 7 + Supabase PostgreSQL with `User`, `Project`, `ApiVersion`, and `Comparison`.
- A comparison stores `totalChanges` and one JSONB `changes` array. There are no child finding tables.
- Register/login/logout/me API routes with bcrypt and JWT cookies, Next 16 `proxy.ts` protection.
- Project CRUD, version upload with engine validation, raw version viewer, compare dialog.
- Comparison read API, JSON export, and delete; failed comparisons are stored and reopenable.
- Slim app header shared across the product, and a full-width app layout on every page.
- Full-height comparison workspace with a type sidebar and full-width change cards.
- Cards use exactly two tags: a color-coded change-type badge and a neutral category badge. Badges use slightly rounded corners, not pills.
- Dashboard shows projects and totals only; recent comparisons were removed.
- Project comparisons are cards with added/removed/modified/deprecated summaries and a **View changes** action.
- Deprecations are a tag and filter inside the changes list, not a separate tab.
- Each change includes a focused full-line source hunk showing only the changed lines, GitHub-style green additions and red removals, and old/new line numbers.
- Full end-to-end test against Supabase: the reference pair stores **83 unique changes**, all with source hunks, exports all 83, and exposes no internal pointers.

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
├── docs/
│   ├── notes.md
│   ├── decisions.md
│   └── day1/                       # seed specs, scratch outputs, fixture generator
├── comparison-service/             # Go service, Dockerfile, fixtures, tests
│   ├── go.mod
│   ├── testdata/pairs/             # 31 fixture pairs
│   └── ...
└── web/
    ├── src/app/                    # Next.js App Router
    ├── prisma/                     # schema and migrations
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
- The comparison calls the Go `/diff` endpoint and stores one JSONB `changes` array.
- Results are stored immediately; reopening does not call the Go service.
- Failed comparisons are saved and can be opened by id.
- The project page shows each comparison as a card with its summary and a **View changes** button.
- The app header is sticky and fixed-layout: brand on the left, conditional mono breadcrumb, and user/logout on the right. It shows `project / file 1 → file 2` on comparison pages.
- Export and delete live on each project comparison card, not in the comparison header.
- The workspace fills the viewport. A sidebar lists change types using the shadcn sidebar theme, without a header or count badges. Selecting a type shows that type's changes as full-width cards.
- Filters use the shadcn Select component with a visible selected state.
- Each card shows the complete changed source lines with old/new line numbers, green additions, and red removals. No surrounding padding is added.
- Deprecated changes are tagged and can be filtered; internal JSON pointers are never displayed.

## Next steps

1. Security hardening and packaging review.
2. Docker Compose and deployment documentation.

## Security notes

- oasdiff runs with `--allow-external-refs=false`.
- The comparison service uses a shared secret and is not published in Compose.
- The session cookie is HttpOnly, SameSite=Lax, and `Secure` only when `COOKIE_SECURE=true`.
- Spec content, cookies, secrets, and emails must never be logged.
