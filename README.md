# Diffora

Diffora compares two versions of an OpenAPI specification and shows exactly what changed. It reports the changes — it does not judge whether they are safe or breaking.

```text
Browser ──► Next.js web app (Vercel)
              │
              ├──► Supabase PostgreSQL (users, projects, versions, comparisons)
              │
              └──► Go comparison service (EC2) ──► oasdiff (pinned v1.38.0)
```

- **Web app** (`web/`): Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui, Prisma 7, email/password login with JWT cookies.
- **Comparison service** (`comparison-service/`): small Go HTTP service that runs the [oasdiff](https://github.com/oasdiff/oasdiff) binary with fixed, safe arguments and returns one deduplicated `changes` array.
- **Database**: Supabase PostgreSQL. A comparison is stored once; reopening it never calls the Go service again.

## Repository layout

```text
Diffora/
├── README.md                     # you are here
├── comparison-service/          # Go service (deploy on EC2)
│   ├── cmd/server/               #   entrypoint
│   ├── internal/
│   │   ├── config/               #   reads env vars
│   │   ├── httpapi/              #   routes, auth, handlers
│   │   ├── oasdiff/              #   runs the engine binary safely
│   │   ├── diffchange/           #   raw engine output → typed changes
│   │   ├── specdoc/              #   YAML/JSON parsing for pointers
│   │   └── model/                #   request/response structs
│   ├── testdata/pairs/           #   fixture pairs used by the tests
│   └── go.mod
└── web/                          # Next.js app (deploy on Vercel)
    ├── prisma/                   #   schema + migrations
    └── src/
        ├── app/                  #   pages (app router) + api/ routes
        ├── components/           #   UI components
        ├── lib/                  #   auth, db, helpers
        └── proxy.ts              #   cookie check before pages load
```

## Prerequisites

- Node.js 22 and npm
- Go 1.27
- A [Supabase](https://supabase.com) project (free tier works)
- The **oasdiff 1.38.0** binary (next section)

## Setup

### 1. Install oasdiff (once)

The service calls the `oasdiff` binary. Download release **1.38.0** for your platform from <https://github.com/oasdiff/oasdiff/releases/tag/v1.38.0> and verify it against the published `checksums.txt`. On Windows PowerShell:

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

On Linux, use the `oasdiff_1.38.0_linux_amd64.tar.gz` asset instead and extract `oasdiff` to somewhere on your `PATH` (e.g. `/usr/local/bin`).

### 2. Copy the environment files

```powershell
Copy-Item web/.env.example web/.env.local
Copy-Item comparison-service/.env.example comparison-service/.env
```

Fill `web/.env.local` (Supabase gives you both URLs under *Project Settings → Database → Connection string*):

```dotenv
DATABASE_URL=postgresql://...pooler...:6543/postgres?sslmode=require   # runtime (pooled)
DIRECT_URL=postgresql://...direct...:5432/postgres?sslmode=require     # migrations only
JWT_SECRET=at-least-32-random-bytes
COOKIE_SECURE=false                    # true in production (HTTPS)
APP_ORIGIN=http://localhost:3000
COMPARISON_SERVICE_URL=http://localhost:8080
COMPARISON_SHARED_SECRET=test-secret
```

In `comparison-service/.env`, set `SHARED_SECRET=test-secret` (it must match `COMPARISON_SHARED_SECRET`) and point `OASDIFF_BIN` at the binary you downloaded.

### 3. Apply the database migrations

```powershell
cd web
npm install
npm run db:deploy        # applies prisma/migrations with DIRECT_URL
```

### 4. Run the comparison service

```powershell
cd comparison-service
$env:SHARED_SECRET = "test-secret"
$env:OASDIFF_BIN = (Resolve-Path ..\tools\oasdiff\v1.38.0\oasdiff.exe).Path   # Windows
$env:PORT = "8080"
go run ./cmd/server
```

Check it: `Invoke-RestMethod http://127.0.0.1:8080/health`

### 5. Run the web app

```powershell
cd web
npm run dev
```

Open <http://localhost:3000/register>, create an account, then create a project, upload two spec versions, and hit **Compare**.

## How the app fits together

| Concept | Where | What happens |
|---|---|---|
| Sign in | `src/lib/auth.ts` | bcrypt password check, then a signed JWT in an HttpOnly cookie |
| Upload a version | `api/projects/[projectId]/versions` | The file is parsed, sent to the Go service's `/validate`, and stored as-is |
| Run a comparison | `api/projects/[projectId]/comparisons` | Both stored specs go to the Go service's `/diff`; the returned `changes` array is saved as one JSON column |
| View a comparison | `app/(app)/comparisons/[comparisonId]` | Reads only the database. Sidebar lists change types; each card shows the exact changed source lines |

Upload rules: `.yaml`/`.yml`/`.json`, up to 2 MB, valid UTF-8, OpenAPI 3.0.x or 3.1.x. Both compared versions must use the same format. Changes to a `deprecated` field are filtered out by the service and never stored.

## Useful commands

Web (run inside `web/`):

```text
npm run dev          start the dev server
npm run build        production build
npm run lint         eslint
npm run typecheck    tsc --noEmit
npm run db:deploy    apply migrations
npm run db:migrate   create a new migration from schema.prisma changes
npm run db:studio    browse the database
```

Comparison service (run inside `comparison-service/`):

```powershell
go vet ./...
go test ./...
# optional: real-engine integration test
$env:OASDIFF_BIN = (Resolve-Path ..\tools\oasdiff\v1.38.0\oasdiff.exe).Path
go test ./...
```

## Deployment

### Web app → Vercel

1. Import the repository, set the **Root Directory** to `web` (Node 22).
2. Add the environment variables from `web/.env.example` under *Settings → Environment Variables* — with production values: `COOKIE_SECURE=true`, `APP_ORIGIN=https://your-domain.com`, `COMPARISON_SERVICE_URL=https://your-ec2-host`.
3. Deploy. Run migrations with `npm run db:deploy` from your machine beforehand, not from the build.

### Comparison service → EC2

The service is stateless, so an EC2 setup is just "binary + systemd":

1. Launch a small Linux instance, install the oasdiff 1.38.0 binary (e.g. to `/usr/local/bin/oasdiff`) and a Go toolchain (or build `server` locally with `GOOS=linux go build ./cmd/server` and upload it).
2. Create `/etc/diffora.env`:

   ```dotenv
   PORT=8080
   SHARED_SECRET=<the same value as COMPARISON_SHARED_SECRET on Vercel>
   OASDIFF_BIN=/usr/local/bin/oasdiff
   ```

3. Run it under systemd with an HTTPS reverse proxy (nginx/Caddy) in front, or use an ALB. Keep the port private; the `X-Shared-Secret` header is the real gate.

4. Smoke test: `curl https://your-ec2-host/health` should return `{"status":"ok","engineVersion":"1.38.0"}`.

### After both are live

1. `https://your-domain.com/api/health` → `{"status":"ok","database":"ok"}`
2. Register, create a project, upload two specs, compare, export.
3. If **Compare** returns `502`, Vercel cannot reach the service (check the URL). If it returns `401`, the two shared secrets differ.

## Security notes

- oasdiff always runs with `--allow-external-refs=false`; specs with external refs are rejected.
- The comparison service is protected by a shared secret and never touches the database.
- The session cookie is HttpOnly + SameSite=Lax; `Secure` when `COOKIE_SECURE=true`.
- Spec content, secrets, and emails are never logged.
