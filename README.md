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

Production layout:

```text
Browser ──HTTPS──► Vercel (Next.js)
                      │
                      ├──► Supabase PostgreSQL (pooled connection)
                      │
                      └──HTTPS──► EC2 (Go service + oasdiff, TLS via Caddy)
```

Before you start you need: a Supabase project, a Vercel account, an EC2 instance
(Ubuntu 22.04/24.04; `t3.micro` is enough for small specs), an Elastic IP, and a
domain or subdomain for the API (e.g. `api.yourdomain.com`).

### Step 1 — Database (Supabase)

1. Create the project and open **Project Settings → Database → Connection string**.
2. Copy both URLs:
   - **Pooled** (transaction mode, port 6543) → `DATABASE_URL`, used at runtime.
   - **Direct** or **session pooler** (port 5432) → `DIRECT_URL`, used by migrations only.
3. Apply the migrations from your machine (not from the Vercel build):

   ```powershell
   cd web
   Copy-Item .env.example .env.local
   # paste both Supabase URLs into .env.local
   npm ci
   npm run db:deploy
   npx prisma migrate status
   ```

   Re-run `npm run db:deploy` after any new migration; it is safe to repeat.

### Step 2 — Comparison service (EC2)

1. **Launch the instance** (Ubuntu 22.04/24.04). Allocate an **Elastic IP** and
   associate it, so the address survives restarts.
2. **Security group** inbound rules: SSH (22) from your IP, HTTP (80) and HTTPS
   (443) from anywhere. Do **not** open 8080 — Caddy proxies to it locally.
3. **Install oasdiff 1.38.0** on the instance:

   ```bash
   cd /tmp
   curl -fsSLO https://github.com/oasdiff/oasdiff/releases/download/v1.38.0/oasdiff_1.38.0_linux_amd64.tar.gz
   sha256sum oasdiff_1.38.0_linux_amd64.tar.gz
   # expect 613037fd6a1d3362a1b742d6d86c338c0eb5ab3511f4942ce3948e78720ea2da
   tar -xzf oasdiff_1.38.0_linux_amd64.tar.gz
   sudo install -m 0755 oasdiff /usr/local/bin/oasdiff
   oasdiff --version   # oasdiff version 1.38.0
   ```

4. **Build and copy the service binary** (from your machine):

   ```powershell
   cd comparison-service
   $env:GOOS = "linux"; $env:GOARCH = "amd64"
   go build -o diffora-comparison ./cmd/server
   scp ./diffora-comparison ubuntu@<elastic-ip>:/tmp/
   ```

   (You can also install Go on the instance and run `go build ./cmd/server` there.)

5. **Create a service user and install the binary** (on the instance):

   ```bash
   sudo useradd --system --home /opt/diffora --shell /usr/sbin/nologin diffora
   sudo mkdir -p /opt/diffora
   sudo install -o diffora -g diffora -m 0755 /tmp/diffora-comparison /opt/diffora/comparison-service
   ```

6. **Create the environment file** (generate the secret with
   `openssl rand -hex 32`; it must match `COMPARISON_SHARED_SECRET` on Vercel):

   ```bash
   sudo tee /etc/diffora.env >/dev/null <<'EOF'
   PORT=8080
   SHARED_SECRET=replace-with-a-long-random-secret
   OASDIFF_BIN=/usr/local/bin/oasdiff
   VALIDATE_TIMEOUT_SECONDS=20
   DIFF_TIMEOUT_SECONDS=60
   MAX_REQUEST_BYTES=20971520
   MAX_ENGINE_STDOUT_BYTES=33554432
   MAX_CHANGES=5000
   EOF
   sudo chmod 600 /etc/diffora.env
   ```

7. **Run it under systemd**:

   ```bash
   sudo tee /etc/systemd/system/diffora-comparison.service >/dev/null <<'EOF'
   [Unit]
   Description=Diffora comparison service
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=simple
   User=diffora
   Group=diffora
   EnvironmentFile=/etc/diffora.env
   ExecStart=/opt/diffora/comparison-service
   Restart=on-failure
   RestartSec=2
   NoNewPrivileges=true
   PrivateTmp=true

   [Install]
   WantedBy=multi-user.target
   EOF

   sudo systemctl daemon-reload
   sudo systemctl enable --now diffora-comparison
   systemctl status diffora-comparison --no-pager
   curl http://127.0.0.1:8080/health   # {"status":"ok","engineVersion":"1.38.0"}
   ```

8. **Add HTTPS with Caddy** (automatic Let's Encrypt certificate). Point an
   **A record** for `api.yourdomain.com` at the Elastic IP first, then:

   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install -y caddy

   sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
   api.yourdomain.com {
       reverse_proxy 127.0.0.1:8080
   }
   EOF
   sudo systemctl reload caddy
   ```

9. **Verify**:

   ```bash
   curl https://api.yourdomain.com/health
   # → {"status":"ok","engineVersion":"1.38.0"}
   curl -i -X POST https://api.yourdomain.com/validate -H "Content-Type: application/json" -d '{}'
   # → HTTP 401 without the shared secret
   ```

10. **Enable the firewall**:

    ```bash
    sudo ufw allow OpenSSH
    sudo ufw allow 80,443/tcp
    sudo ufw enable
    ```

### Step 3 — Web app (Vercel)

1. Vercel → **Add New → Project** → import the repository.
2. **Root Directory:** `web`. Framework: Next.js (auto-detected). Node: 22
   (pinned in `package.json`).
3. Add these under **Settings → Environment Variables** (Production):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase pooled URL (port 6543) |
   | `DATABASE_POOL_MAX` | `5` |
   | `JWT_SECRET` | `openssl rand -hex 32` |
   | `COOKIE_SECURE` | `true` |
   | `APP_ORIGIN` | `https://your-domain.com` |
   | `COMPARISON_SERVICE_URL` | `https://api.yourdomain.com` |
   | `COMPARISON_SHARED_SECRET` | same value as the EC2 `SHARED_SECRET` |
   | `COMPARISON_TIMEOUT_MS` | `50000` on Hobby, `90000` on Pro |
   | `MAX_UPLOAD_REQUEST_BYTES` | `4194304` |
   | `MAX_SPEC_BYTES` | `2097152` |
   | `MAX_CHANGES_PER_COMPARISON` | `5000` |

4. **Deploy.** Add your domain under **Settings → Domains**, then set
   `APP_ORIGIN` to the final HTTPS origin and redeploy.
5. `https://your-domain.com/api/health` → `{"status":"ok","database":"ok"}`.

`web/vercel.json` adds the security headers (nosniff, frame protection,
referrer policy, HSTS) at the platform level.

### Step 4 — Smoke test

1. Register an account, create a project.
2. Upload two spec versions (`.yaml`/`.yml`/`.json`, ≤ 2 MB each).
3. Run a comparison and open the workspace.
4. Reload the comparison — it should open without calling the Go service.

| Symptom | Cause | Fix |
|---|---|---|
| `502` on compare | Vercel cannot reach the service | Check `COMPARISON_SERVICE_URL`, then `curl https://api.yourdomain.com/health` |
| `401` from the service | Shared secrets differ | Use the same value in Vercel and `/etc/diffora.env`, restart both |
| `504` / function timeout | Diff longer than the plan allows | Pro plan (300s) or lower `COMPARISON_TIMEOUT_MS` |
| Login works but the session drops | `COOKIE_SECURE=true` over HTTP | Use HTTPS, or `false` for local only |
| `P1001` / DB timeout | Wrong Supabase URL or port | Runtime 6543 pooled, migrations 5432 direct |

### Step 5 — Operations

- **Service logs:** `journalctl -u diffora-comparison -f`
- **Restart:** `sudo systemctl restart diffora-comparison`
- **Update the service:** rebuild, `scp` the binary, `sudo install` it, restart.
- **Web:** redeploy from Vercel, after running migrations from your machine.
- **Rotate secrets:** update `JWT_SECRET` (invalidates sessions) or the shared
  secret on both sides, then redeploy/restart both.
- **Uptime:** monitor `/api/health` (web) and `/health` (service).

## Security notes

- oasdiff always runs with `--allow-external-refs=false`; specs with external refs are rejected.
- The comparison service is protected by a shared secret and never touches the database.
- The session cookie is HttpOnly + SameSite=Lax; `Secure` when `COOKIE_SECURE=true`.
- Spec content, secrets, and emails are never logged.
