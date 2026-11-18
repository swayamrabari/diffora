# Deployment

Production topology:

```text
Browser
   │ HTTPS
   ▼
Vercel (Next.js app, serverless functions)
   │  HTTPS + X-Shared-Secret
   ▼
Comparison service (Go + oasdiff, Docker)
   │
   ▼
Supabase Postgres (pooled connection)
```

- **Web**: Vercel, project root `web/`.
- **Comparison service**: any container host. Fly.io is the recommended default; Google Cloud Run is the alternative.
- **Database**: Supabase Postgres, pooled URL for runtime and direct URL for migrations.
- **CI**: `.github/workflows/ci.yml` runs web lint/build and Go vet/tests.

Nothing below is executed automatically. Work through the sections in order.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| Supabase project | Postgres 15+. One project is enough for app + migrations. |
| Vercel account | Git provider connected. Hobby works; Pro is recommended for long diffs. |
| Fly.io account | Or Cloud Run / Render / Railway (see §4 alternatives). |
| Node.js 22 | Local machine, for Prisma migrations. |
| Go 1.27 | Only if you want to run the service locally. |
| Domain (optional) | e.g. `diffora.example.com`. |

Generate two independent secrets now (PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- First value → `JWT_SECRET` (Vercel).
- Second value → `SHARED_SECRET` on the Go service **and** `COMPARISON_SHARED_SECRET` on Vercel. They must be identical.

---

## 2. Choose regions

Pick one region for all three parts. Cross-region calls add 100–250 ms per comparison.

| Piece | Setting |
|---|---|
| Supabase | Project region, e.g. `ap-south-1` (Mumbai) |
| Vercel | Project → Settings → Functions → Region, e.g. `bom1` |
| Fly.io | `primary_region` in `comparison-service/fly.toml`, e.g. `bom` |

If your database is in Mumbai, do not leave Vercel functions in `iad1` (US East) — every page would query Postgres across the world.

---

## 3. Supabase

1. Create the project and note the database password.
2. Open **Project Settings → Database → Connection string**.
3. Copy both URLs:

```dotenv
# Runtime: transaction pooler, port 6543
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require

# Migrations: direct connection (or session pooler), port 5432
DIRECT_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres?sslmode=require
```

Notes:

- Use the **pooled** URL for `DATABASE_URL`. Serverless functions open a pool per instance; the transaction pooler keeps that safe.
- `DIRECT_URL` is only used by the Prisma CLI (`prisma migrate deploy`). It is never read at runtime.
- If the direct host is unreachable (IPv6-only networks), use the **session pooler** URL on port 5432 instead.
- Keep `sslmode=require`.
- Do not put the service-role key anywhere; this app only talks to Postgres directly.

Apply the schema before the first Vercel deploy:

```powershell
cd web
$env:DATABASE_URL = "postgresql://...:6543/postgres?sslmode=require"
$env:DIRECT_URL   = "postgresql://...:5432/postgres?sslmode=require"
npm ci
npm run db:deploy
npx prisma migrate status
```

`npm run db:deploy` runs `prisma migrate deploy`, which applies every migration in `prisma/migrations` in order. It is safe to re-run.

Do **not** run migrations from the Vercel build. Two concurrent builds can race, and the build would need the direct database URL.

---

## 4. Deploy the comparison service

The Go service is stateless, needs the oasdiff binary, and must be reachable over HTTPS from Vercel. `comparison-service/Dockerfile` installs a checksum-pinned oasdiff binary and runs as a non-root user.

### 4.1 Fly.io (recommended)

Why: always-on machine, no cold starts, Docker-native, cheap for a single small VM, HTTPS included.

```powershell
cd comparison-service
fly auth login
# edit fly.toml: set `app` to a unique name and `primary_region` to your region
fly apps create <your-app-name>
fly secrets set SHARED_SECRET="<the shared secret>"
fly deploy
fly status
```

Verify:

```powershell
Invoke-RestMethod https://<your-app-name>.fly.dev/health
# { status = ok; engineVersion = 1.38.0 }
```

The service now exposes:

- `GET /health` — unauthenticated.
- `POST /validate`, `POST /diff` — require `X-Shared-Secret`.

The `fly.toml` keeps one machine running (`auto_stop_machines = "off"`). To cut cost and accept a 1–2 s cold start, switch it to `"suspend"`.

Bump the VM if large specs OOM: `[[vm]] memory = "1gb"`.

### 4.2 Alternative: Google Cloud Run

Why: scales to zero, generous free tier, HTTPS included.

```bash
gcloud run deploy diffora-comparison \
  --source comparison-service \
  --region asia-south1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 4 \
  --set-env-vars OASDIFF_BIN=/usr/local/bin/oasdiff \
  --set-secrets SHARED_SECRET=diffora-shared-secret:latest
```

- `SHARED_SECRET` must come from Secret Manager, not `--set-env-vars`.
- `--concurrency 4` limits parallel oasdiff processes per instance; raising it can starve CPU.
- `--allow-unauthenticated` is required for a plain HTTPS endpoint; requests are still gated by `X-Shared-Secret`.
- Set `--min-instances 1` to avoid cold starts.

### 4.3 Alternative: Render / Railway

Both build the Dockerfile directly.

- Root directory: `comparison-service`.
- Health check path: `/health`.
- Env: `PORT=8080`, `OASDIFF_BIN=/usr/local/bin/oasdiff`, `SHARED_SECRET=<secret>`.
- Render's free tier spins down; expect 30–60 s cold starts that will exceed the Vercel timeout.

### 4.4 Verify auth before wiring Vercel

```powershell
$body = '{"content":"openapi: 3.0.3\ninfo:\n  title: t\n  version: \"1\"\npaths: {}\n","format":"yaml"}'
Invoke-RestMethod -Method Post https://diffora-comparison.fly.dev/validate `
  -Headers @{ "X-Shared-Secret" = "<secret>" } `
  -ContentType "application/json" -Body $body
```

A request without the header must return `401 UNAUTHORIZED`.

---

## 5. Deploy the web app on Vercel

### 5.1 Import the project

1. Vercel → **Add New → Project** → import the repository.
2. Set **Root Directory** to `web`.
3. Framework preset: **Next.js** (auto-detected).
4. Build command: `npm run build` (default). Install command: default.
5. Node.js version: **22.x** (also pinned via `engines` in `web/package.json`).

`output: "standalone"` in `next.config.ts` is ignored on Vercel and matters only for self-hosting.

### 5.2 Environment variables

Add these under **Project → Settings → Environment Variables**. Scope them to **Production** (and Preview if you use previews).

| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | Supabase pooled URL, port 6543 | yes |
| `DIRECT_URL` | Supabase direct/session URL, port 5432 | yes |
| `DATABASE_POOL_MAX` | `5` (lower to `3` if Supabase reports pool exhaustion) | no |
| `JWT_SECRET` | 64-char hex secret | yes |
| `COOKIE_SECURE` | `true` | yes |
| `APP_ORIGIN` | `https://your-domain.com` (exact, no trailing slash) | yes |
| `COMPARISON_SERVICE_URL` | `https://diffora-comparison.fly.dev` | yes |
| `COMPARISON_SHARED_SECRET` | same value as the Go `SHARED_SECRET` | yes |
| `COMPARISON_TIMEOUT_MS` | `90000` (see §5.4) | no |
| `MAX_SPEC_BYTES` | `2097152` | no |
| `MAX_UPLOAD_REQUEST_BYTES` | `4194304` | no |
| `MAX_DIFF_RESPONSE_BYTES` | `67108864` | no |
| `MAX_CHANGES_PER_COMPARISON` | `5000` | no |

Optional CLI path:

```powershell
npm i -g vercel
cd web
vercel link
vercel env add DATABASE_URL production
# repeat for each variable
vercel --prod
```

### 5.3 Functions region

**Settings → Functions → Region** → choose the region from §2. This affects every route handler and server-rendered page.

### 5.4 Function duration

- `POST /api/projects/[projectId]/comparisons` declares `maxDuration = 300`.
- `POST /api/projects/[projectId]/versions` declares `maxDuration = 60`.

Vercel clamps these to your plan limit:

| Plan | Max duration | Recommendation |
|---|---|---|
| Hobby | 60 s | Set `COMPARISON_TIMEOUT_MS=50000`; large specs may time out. |
| Pro | 300 s | Defaults are fine. |

### 5.5 Custom domain

Add the domain in Vercel, then update `APP_ORIGIN` to the canonical HTTPS origin and redeploy. Cookies are `Secure` and `HttpOnly`, so plain HTTP will not keep a session.

### 5.6 Alternative: self-hosting the web app

`next build` produces `.next/standalone`; run `node .next/standalone/server.js` behind a TLS-terminating proxy. This path is supported by the config but not covered by this guide.

---

## 6. First-run smoke test

Run these in order after both deployments are live.

1. `GET https://your-domain.com/api/health` → `{"status":"ok","database":"ok"}`.
2. Open the site → `/register` → create an account.
3. Reload → session persists (cookie is `Secure`, `HttpOnly`).
4. Create a project.
5. Upload two OpenAPI specs (`.yaml`/`.yml`/`.json`, ≤ 2 MB).
6. Click **Compare** → the comparison completes and opens the workspace.
7. Switch categories in the sidebar → instant, no network request (client-side filtering).
8. Search, filter by type and method → results update without reload.
9. Reload the comparison URL → filters restored from the query string.
10. Export a comparison → JSON downloads.
11. `fly logs` (or Cloud Run logs) shows `POST /diff` with status `200`.
12. Sign out → protected routes redirect to `/login`.

If step 6 returns `502 COMPARISON_UNAVAILABLE`, the Vercel function cannot reach the Go service. If it returns `401`, the shared secrets differ.

---

## 7. Ongoing operations

### Migrations

Run before deploying code that depends on a new schema:

```powershell
cd web
$env:DIRECT_URL = "postgresql://...:5432/postgres?sslmode=require"
npx prisma migrate deploy
npx prisma migrate status
```

`prisma7.config.ts` already prefers `DIRECT_URL` for migrations.

### Rollback

- **Vercel**: Deployments → previous deployment → **Promote to Production** (instant, no rebuild).
- **Fly.io**: `fly releases` then `fly deploy --image registry.fly.io/diffora-comparison:<tag>`.
- **Cloud Run**: `gcloud run services update-traffic --to-revisions=<revision>=100`.
- **Database**: migrations are forward-only. Ship a new migration instead of editing applied ones.

### Logs and monitoring

- Vercel → Project → Logs (runtime errors, 4xx/5xx).
- `fly logs` / Cloud Run logs (request lines with status and duration).
- Supabase → Reports (connections, slow queries, CPU).
- Add an uptime monitor hitting `/api/health` (web) and `/health` (Go) every minute.

### Secret rotation

`JWT_SECRET`: rotate in Vercel and redeploy. All sessions are invalidated.

`SHARED_SECRET` / `COMPARISON_SHARED_SECRET`: must be updated on both sides. There is a short window where one side still has the old value, so comparisons fail with `401`. Update both, then redeploy/restart both.

### Backups

Supabase takes daily backups on paid plans. For free projects, schedule `pg_dump` yourself. Uploaded specs are stored in `ApiVersion.content`, so a database backup is a full backup of the app.

---

## 8. Limits

| Limit | Value | Where |
|---|---|---|
| Spec file size | 2 MB | App (`MAX_SPEC_BYTES`), enforced client + server |
| Upload request size | 4 MB | App; Vercel hard-caps request bodies at 4.5 MB |
| Diff response | 64 MB | App (`MAX_DIFF_RESPONSE_BYTES`) |
| Changes per comparison | 5000 | App + Go (`MAX_CHANGES`) |
| Go request body | 20 MB | Go (`MAX_REQUEST_BYTES`) |
| Validate timeout | 20 s | Go |
| Diff timeout | 60 s | Go |
| Web → Go timeout | 90 s | App (`COMPARISON_TIMEOUT_MS`) |
| Function duration | 60 s (Hobby) / 300 s (Pro) | Vercel |
| DB connections per instance | 5 | App (`DATABASE_POOL_MAX`) |

Keep `MAX_UPLOAD_REQUEST_BYTES` below 4.5 MB unless you move uploads to direct-to-storage. Raising it will not help: Vercel rejects the body before the route runs.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `403 INVALID_ORIGIN` | `Origin` header matches neither `APP_ORIGIN` nor the request host | Set `APP_ORIGIN` to the exact HTTPS origin; redeploy |
| `409`/`500` on login, no session | `JWT_SECRET` missing or < 32 chars | Fix the env var and redeploy |
| Session drops on reload | `COOKIE_SECURE=true` over HTTP | Use HTTPS, or `false` only for local dev |
| `413 PAYLOAD_TOO_LARGE` | Body above 4.5 MB (Vercel) | Upload a smaller spec; check `MAX_UPLOAD_REQUEST_BYTES` |
| `502 COMPARISON_UNAVAILABLE` | Wrong `COMPARISON_SERVICE_URL`, service down, or network block | Open `COMPARISON_SERVICE_URL/health` from a browser |
| `401 UNAUTHORIZED` from Go | Secret mismatch | Re-set both secrets to the same value |
| `504` / function timeout | Diff exceeded the plan's duration | Raise `maxDuration` (Pro) or reduce `COMPARISON_TIMEOUT_MS` |
| Slow pages in production | Vercel region far from Supabase | Move functions and DB into the same region |
| `P1001` / connection timeout | Wrong port or pooler URL | Runtime → 6543 pooled; migrations → 5432 direct |
| Pool exhaustion | `DATABASE_POOL_MAX` too high across instances | Lower to `3`, confirm the pooled URL |
| Go OOM on large specs | 512 MB VM | Bump memory to 1 GB |

---

## 10. Pre-deploy checklist

- [ ] `npm run lint` and `npm run build` pass in `web/`.
- [ ] `go vet ./...` and `go test ./...` pass in `comparison-service/`.
- [ ] `prisma migrate status` reports no pending migrations.
- [ ] Vercel root directory is `web`, Node 22.
- [ ] All required env vars set for Production.
- [ ] `COOKIE_SECURE=true`, `APP_ORIGIN` is the final HTTPS origin.
- [ ] Go service `/health` responds and `/validate` rejects requests without the secret.
- [ ] `/api/health` reports `{"status":"ok","database":"ok"}`.
- [ ] Full smoke test (§6) passes on the production domain.
