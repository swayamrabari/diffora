# Diffora — API Specification Comparison Tool: Build Specification (v2)

> **Status:** revised plan, 2026-11-17. Supersedes v1.
> **Source of truth:** this file. If another document, comment, or scaffold disagrees, this file wins until it is explicitly updated.
> **Product scope:** demo-grade, end-to-end, single-user-per-account, locally run with Docker Compose.
> **Core rule:** Diffora reports *what changed*. It never judges whether a change is safe, breaking, severe, or compatible.

---

## v3 implementation update (Phase 1)

The build has moved to a simpler engine-driven design. This block supersedes the v2 normalizer contract in sections 5.1 and 11–14 wherever they conflict.

**Engine calls per comparison:**

```text
oasdiff diff      base.<yaml|json> target.<yaml|json> -f json --allow-external-refs=false
oasdiff changelog base.<yaml|json> target.<yaml|json> -f json --allow-external-refs=false
oasdiff summary   base.<yaml|json> target.<yaml|json> -f json --allow-external-refs=false
oasdiff breaking  base.<yaml|json> target.<yaml|json> -f json --allow-external-refs=false
```

**What changed:**

- The Go service is a thin proxy. It writes the uploaded content as-is and passes it to oasdiff. There is no YAML converter, no metadata extraction, and no external-ref pre-scan.
- Both compared versions must use the same format. Mixing YAML and JSON returns `400 FORMAT_MISMATCH`. Every result is JSON.
- The service returns `rawDiffText`, `changelog`, `summary`, `breaking`, `deprecations`, and structured `changes`.
- `changelog` is the primary Changes list. It is a flat, per-operation array.
- `summary` is displayed as-is in the Summary tab.
- `breaking` is displayed as-is in the Breaking tab.
- `deprecations` is a small subset extracted from `diff` where `deprecated` changes to `true`.
- Severity/level labels are now allowed. This intentionally removes the v1 “no breaking/warning/severity labels” rule.
- There is no full semantic normalizer (no `usedBy`, no generated titles, no manual value merging). A focused structured diff pass follows `$ref` to component pointers, deduplicates operation copies, and assigns categories. The old `DetectedChange` table is still not used; `ComparisonDiffChange` replaces it for the type-based Changes view.
- `Comparison` stores `rawDiffText` (`Text`), `summary` (`Json`), `deprecations` (`Json`), counts, `engineVersion`, `durationMs`, `status`, and `errorMessage`.
- `ComparisonFinding` stores one row per changelog or breaking item: `kind` (`changelog` or `breaking`), `position`, `level`, `levelName`, `ruleId`, `text`, `operation`, `operationId`, `path`, `section`, `line`, `column`, `endLine`, `endColumn`. Index filters by comparison, kind, level, path, section, and rule ID.
- `ComparisonDiffChange` stores the structured, deduplicated diff: `category`, `changeType`, `subcategory`, `path`, `method`, `component`, `field`, base/target pointers, old/new values and presence flags. The Go service follows `$ref` to component pointers and deduplicates operation copies.
- Changelog and breaking data are stored as rows rather than one giant JSON blob so the UI can filter and paginate without parsing everything. The Changes tab uses `ComparisonDiffChange`; Breaking and Deprecations use their own tables.

**Go `/diff` response contract:**

```json
{
  "engineVersion": "1.38.0",
  "durationMs": 412,
  "rawDiffText": "{\"info\":...}",
  "changelog": [
    {
      "id": "response-optional-property-added",
      "text": "added the optional property `tag` to the response with the `200` status",
      "level": 1,
      "levelName": "info",
      "operation": "GET",
      "operationId": "getPet",
      "path": "/pets/{petId}",
      "section": "paths",
      "line": 197,
      "column": 11
    }
  ],
  "summary": { "diff": true, "details": {} },
  "breaking": [],
  "deprecations": [
    {
      "pointer": "/paths/~1pets/get/deprecated",
      "path": "/pets",
      "method": "GET",
      "oldValue": false,
      "newValue": true,
      "oldValuePresent": true,
      "newValuePresent": true
    }
  ],
  "changes": [
    {
      "category": "parameter",
      "changeType": "modified",
      "subcategory": "query",
      "path": "/pets",
      "method": "GET",
      "component": null,
      "field": "maximum",
      "basePointer": "/paths/~1pets/get/parameters/1/schema/maximum",
      "targetPointer": "/paths/~1pets/get/parameters/1/schema/maximum",
      "displayPointer": "/paths/~1pets/get/parameters/1/schema/maximum",
      "oldValue": 100,
      "newValue": 200,
      "oldValuePresent": true,
      "newValuePresent": true
    }
  ]
}
```

**UI tabs:** Summary, Changes, Breaking, Deprecations, Source diff. Changes uses the structured `ComparisonDiffChange` rows with type/endpoint grouping, filters, and Before/After value panels. Breaking uses grouped changelog rows. Deprecations uses readable labels. Source diff remains a separate canonical-text diff.

**Superseded v2 sections:**

- Section 5.1’s three-command list is replaced by the four commands above.
- Section 12 (normalization rules) is reference only.
- Section 13.1 (`DetectedChange` Go contract) is not used.
- Section 14 counts are derived from the changelog/breaking/deprecations arrays.
- The `DetectedChange` Prisma model is replaced by `ComparisonFinding` rows.

The remaining sections (auth, upload validation, engine safety, Docker, security) still apply.

---

## How to use this document

1. Read section 0 first. It lists the v1 problems that v2 fixes. Do not reintroduce them.
2. Phases 0 and 1 are complete. The next implementation step is Phase 2 (database, auth, app shell).
3. Sections 11–14 are superseded by the v3 block above. Do not rebuild the normalizer.
4. When a real engine output differs, record it in `docs/notes.md` and update the v3 block.
5. Never drop engine findings. Store every changelog/breaking item or fail the comparison explicitly.

**Implementation rules:**

- Use the exact file names, routes, field names, and rules in this document, except where the v3 block supersedes them.
- Run oasdiff only through the four commands in the v3 block.
- Severity/level labels are allowed in v3. Do not add compatibility or safety judgments beyond what oasdiff returns.
- Do not add AI features, background jobs, queues, sharing, public links, or anything outside section 2.
- Keep the four-output contract: `rawDiffText`, `changelog`, `summary`, `breaking`, plus `deprecations`.
- Both compared versions must use the same format; return `FORMAT_MISMATCH` otherwise.
- Keep page reads on the server and secrets out of the browser.

---

## 0. Review of v1: findings and resolutions

This table records the review that produced v2. Each row is a real issue found while checking v1 against the repository, the installed Next.js 16.4.6 scaffold, the installed oasdiff build, and live `oasdiff diff` output.

| ID | Finding in v1 | Why it matters | Resolution in v2 |
|---|---|---|---|
| R1 | v1 uses `src/middleware.ts` and says it runs in the Edge runtime. Next.js 16.4.6 has **deprecated `middleware.ts` in favour of `proxy.ts`**; `proxy` defaults to the Node.js runtime. | Auth protection would be written against a deprecated convention and the runtime assumption would be wrong. | Use `web/src/proxy.ts` with an exported `proxy()` function. Proxy verifies the JWT only. Full user lookup stays in the Node data-access layer. |
| R2 | The scaffold has `cacheComponents: true` and `partialPrefetching: true`. v1 assumes simple dynamic Server Components that read Prisma and cookies. | Cache Components changes auth-page rendering and requires Suspense boundaries and instant-navigation decisions. It adds work unrelated to the demo. | Set `cacheComponents: false` and remove `partialPrefetching` for this app. Use dynamic authenticated pages. Revisit only if caching becomes a requirement. |
| R3 | v1 names the root `spec-compare/`, but the repository is `Diffora/`; the actual service folder is misspelled `comparision-service/`. | Paths and scripts will disagree. | Root is `Diffora/`. Service folder is `comparison-service/`. Rename the misspelled folder in Phase 0. |
| R4 | v1 layout uses `web/src/app`, but the scaffold uses `web/app` and has no `src/`. | Every path in the spec and the `@/*` import alias would be wrong. | Move `web/app` to `web/src/app`, keep the `@/*` alias, and place `proxy.ts` at `web/src/proxy.ts`. |
| R5 | v1 refers to `docs/BUILD-SPEC.md` as “this file”, but the file is `DIFFORA.md` at the root. | The source of truth is ambiguous. | `DIFFORA.md` is the only spec. `docs/notes.md` records engine findings. Do not create a second full copy. |
| R6 | v1 says “default options only” but also says to disable remote `$ref` loading if a flag exists. | Contradiction. Remote refs are an SSRF risk. | Pin the exact commands in section 5. Use `--allow-external-refs=false` on both `validate` and `diff`. Also pre-scan for non-fragment `$ref`/absolute `$id` and reject with `EXTERNAL_REF_NOT_SUPPORTED`. |
| R7 | v1 assumes diff keys such as `maximum`. Real output uses `max`, `min`, `exclusiveMax`, `operationID`, `securityRequirements`, lower-cased header names, and `type: { added, deleted }`. | The normalizer would fail to resolve the most common schema and operation changes. | Add a complete key-mapping table and side-aware resolver in section 12.4. |
| R8 | The repository sample `v1.yaml` **fails** `oasdiff validate` with `path-parameters-mismatch` for `DELETE /pets/{petId}`. | Any fixture that is not valid is rejected at upload, so the comparison can never be created. | Every fixture except `invalid-target` must pass `oasdiff validate`. Fix the seed fixtures in Phase 0. |
| R9 | v1 passes the first 500 characters of raw `oasdiff validate` output to the user. That output contains severity words and file paths. | It violates the “no severity labels” and “no file paths” rules. | Run validation with `-f json`, parse findings, strip `file`, and return a message such as `Spec validation failed: <text> (line N)`. Never show `level`, `error`, `warning`, `info`, or a filesystem path. |
| R10 | v1 stores `rawDiff` as Prisma `Json` and calls it “unmodified output”. PostgreSQL `jsonb` reorders keys and drops whitespace, so byte fidelity is impossible. | The export cannot be checked against the engine output, which v1 explicitly promises. | Store exact stdout in `Comparison.rawDiffText` (`Text`). The API/export parses it into `rawDiff`. Record `rawDiffBytes`. |
| R11 | v1 creates a failed `Comparison` row but returns only `{ error: { code, message } }`, so the client cannot open the failed record. | The UI cannot show the error in context or offer “Run again” with the same versions. | Error responses may include `details.comparisonId`. The Compare dialog navigates to the failed comparison. |
| R12 | v1 checks `MAX_CHANGES_PER_COMPARISON` only after the Go service has returned and transferred every change. | A pathological diff can exhaust memory and bandwidth before failing. | Go enforces the limit while normalizing (`limit + 1` → 422 `TOO_MANY_CHANGES`). Web still verifies the limit. |
| R13 | `MAX_REQUEST_BYTES=8388608` is too small for two 2 MB specs after JSON string escaping (quotes, backslashes, newlines). | Valid large uploads fail at the service boundary. | Raise the Go request cap to 20 MiB and add a web-side request-size guard. |
| R14 | v1 sets `Secure` whenever `NODE_ENV=production`. Docker Compose runs a production build on `http://localhost:3000`. | The browser will not send a `Secure` cookie over plain HTTP, so login breaks in the documented local setup. | Add `COOKIE_SECURE` (default `false`). `APP_ORIGIN` and HTTPS deployments set it to `true`. |
| R15 | v1 reads multipart with `request.formData()` and checks only `file.size`; no request-size guard exists. | A large body is buffered before the app can reject it. | Check `Content-Length` against `MAX_UPLOAD_REQUEST_BYTES` first, then check `file.size`. Document the chunked-body fallback. |
| R16 | v1 says “decode as UTF-8 (400 on failure)”. `Buffer.toString('utf8')` never throws; it silently replaces invalid bytes. | Corrupt files are accepted and stored with replacement characters. | Use `new TextDecoder('utf-8', { fatal: true })`. Reject invalid encoding. |
| R17 | v1 does not handle a UTF-8 BOM, empty files, numeric `openapi: 3.0`, multiple YAML documents, duplicate keys, or NUL bytes. | Ordinary real-world files fail inconsistently or parse differently in the two services. | Add explicit upload rules in section 10. |
| R18 | v1 uses `yaml` in Node and `yaml.v3` in Go but never verifies they produce the same JSON. `yaml.v3` has YAML 1.1-era scalar behaviour and may turn timestamps into `time.Time`. | Source diff, validation, and normalization can disagree about the same file. | Add a YAML parity harness and a tag-aware converter in section 11. Treat timestamps and `yes`/`no`/`on`/`off` as strings. |
| R19 | v1 canonicalizes with `JSON.stringify` but does not handle cycles, `NaN`, `Infinity`, `BigInt`, or `Date` values. | A valid-looking YAML file can crash the source diff. | Reject non-JSON values at upload, detect cycles, and define date/binary behaviour in section 15. |
| R20 | v1 dedups on `changeType / displayPointer / title`, but titles may be generated from the operation copy before component attribution. | Operation copies and component copies can both survive, producing duplicate changes. | Attribute to the component first, then generate the title, then dedup on canonical pointers. Detect collisions and warn in section 12.6. |
| R21 | v1 assumes operation-level schema changes stay wrapped in a `$ref`. Real output often inlines the resolved component changes under the operation. | Attribution and `usedBy` fail if the resolver only looks for a literal `$ref` change. | Resolve each side independently through `$ref` while walking the leaf location, and attribute to the component location. |
| R22 | v1 does not define which `$ref` positions `usedBy` traverses. | `usedBy` is one of the advertised features and is easy to under-implement. | Define traversal across parameters, request bodies, responses, headers, content schemas, `allOf`/`oneOf`/`anyOf`, `items`, `additionalProperties`, and component-to-component refs, with cycle protection. |
| R23 | Category mapping omits `components/headers`, `components/links`, `components/callbacks`, `components/examples`, and `components/pathItems`. | These changes would all fall into `other`. | Add explicit mappings in section 12.10. |
| R24 | The title/description table covers only 14 situations. Request bodies, responses, servers, security, webhooks, and unresolved changes have no fallback. | Many changes would have blank or inconsistent titles. | Add a generic title generator with per-category fallbacks in section 12.8. |
| R25 | “Documentation and structural counts” is undefined. | The Counts tab cannot be implemented unambiguously. | Define `documentationChanges` and `structuralChanges = totalChanges - documentationChanges` in section 14. |
| R26 | The dashboard needs “latest 10 comparisons across projects”, and the version page needs “comparisons involving this version”, but no API or query path is defined. | Pages cannot render their required content. | State explicitly that page Server Components query Prisma directly. Keep the JSON API for client mutations and the comparison workspace. Add the required queries in section 16. |
| R27 | v1 lists status codes but not a complete error-code catalogue. | Web and Go will drift, and clients cannot map errors reliably. | Add one canonical error table in section 9.2 and use it in both services. |
| R28 | v1 requires both services to have `/health` for Compose health checks, but the web API list has no health route. | Compose cannot health-check the web service. | Add `GET /api/health` with a DB ping and no auth. |
| R29 | v1 protects API routes but does not require page-level auth. | A page Server Component could render data before the API layer is involved. | Add `(app)/layout.tsx` auth, root redirects, and auth-page redirects in section 7. |
| R30 | Email uniqueness is case-sensitive by default, and duplicate-email status is unspecified. | `A@x.com` and `a@x.com` can create two accounts. | Normalize to trimmed lowercase, store that value, return 409 `EMAIL_TAKEN`. |
| R31 | The Prisma schema lacks a unique `(comparisonId, position)`, several useful indexes, and database-length constraints. | Duplicate positions can corrupt ordering; long inputs are unbounded. | Add `@@unique([comparisonId, position])`, `@db.VarChar` limits, and missing indexes in section 8. |
| R32 | Supabase pooler/direct-URL behaviour and IPv6-only direct hosts are not addressed. | Migrations can fail on some networks; interactive transactions can behave differently through `pgbouncer`. | Document the pooled/direct split, the session-pooler fallback, and transaction caveats in section 8.7. |
| R33 | The Docker plan says “run `prisma migrate deploy` on start” but does not ensure the Prisma CLI and engine are in the runtime image. | The production container can fail at startup. | Add a one-shot `migrate` Compose service with a `migrator` Docker stage. Add standalone output, Prisma engine copy, non-root user, and health checks. |
| R34 | The Playwright plan has no test-database strategy; Compose has no database because production uses Supabase. | E2E tests would mutate the real Supabase project or fail. | Add a local PostgreSQL test profile and a test database in section 18.1. |
| R35 | Fixture `expected.json` is ambiguous: it is described as raw oasdiff output and as normalized expected output. | The Day 1 gate cannot be automated reliably. | Each fixture gets `raw.expected.json` (exact diff JSON) and `expected.json` (normalized changes + warnings). |
| R36 | The 12-hour, two-day estimate is not credible for the stated scope, including auth, upload, normalizer, workspace, source diff, tests, and Docker. | The plan will slip and force cuts in the wrong places. | Replace it with the phased plan in section 19 (~10–11 focused days). Keep an explicit demo cut order. |
| R37 | v1 has no loading, error-boundary, not-found, empty, responsive, or accessibility requirements beyond a few workspace states. | The app will feel unfinished and will fail basic keyboard/mobile use. | Add them in section 16. |
| R38 | v1 has no security headers, CSP, rate limits, or origin checks beyond `SameSite=Lax` and JSON content type. | CSRF and content-injection defence is incomplete. | Add headers, origin checks, and best-effort auth rate limits in section 17. |
| R39 | Sorting has no tie-breaker, so equal category/pointer/type changes can reorder between runs. | IDs and stored positions can change, breaking deep links and tests. | Add a deterministic final tie-breaker in section 12.12. |
| R40 | v1 says “unmodified output” but does not cap engine stdout/stderr, normalized payload, or warnings. | A hostile or huge spec can exhaust service memory. | Add output caps, change caps, warning caps, and `OUTPUT_TOO_LARGE` in sections 5 and 11. |
| R41 | `react-diff-viewer-continued` may not support React 19.3. | The Source diff tab could fail to build. | Verify in Phase 0. Keep a custom `diffLines` renderer as the fallback; the tab is already in the cut order. |
| R42 | The scaffold’s `next.config.ts` contains `experimental.agentFeedback` and the CSS turbopack loader. | These are scaffold/bootstrap details, not product decisions. | Keep the Tailwind loader, remove `agentFeedback`, and set the production options in section 4.3. |
| R43 | Local `oasdiff --version` reports `main`, not a release version. | “Pinned engine version” is not actually pinned. | Pin an exact release tag and SHA-256 in Phase 0 and in the Go Dockerfile. |
| R44 | The sample `breaking.json` exists in the scratch folder. | It is output of an explicitly excluded command and could leak into the app. | Move it to `docs/day1/` as reference only. Never import it, display it, or copy its labels. |
| R45 | v1 never says what happens when a comparison service call fails after a failed row is written, or what a failed comparison exports. | UI and export behaviour are undefined. | Define failed-comparison reads/export as zero changes + `rawDiff: null` + `errorMessage` in section 9.6. |

### 0.1 Decisions that are now fixed

- Next.js **16.4.6**, React **19.3.0**, Node **22 LTS**.
- Auth uses `proxy.ts`, not `middleware.ts`.
- `cacheComponents` is **off** for this app.
- oasdiff is pinned to an exact release and run with `--allow-external-refs=false`.
- Raw engine output is stored as text, not `jsonb`.
- Normalization is side-aware and uses the real oasdiff field names, not the v1 guesses.
- Failed comparisons are first-class records and are addressable by id.
- The app is demo-grade, but it must be end-to-end and testable from a fresh clone.

---

## 1. Product summary

Diffora compares two versions of an OpenAPI specification and shows the differences as a navigable tree. It stores the result so a saved comparison can be reopened without running the engine again.

| Item | Decision |
|---|---|
| Product name | **Diffora** |
| Repository | `Diffora/` (this repository) |
| Frontend and application backend | Next.js 16 App Router, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui, lucide-react, sonner |
| Auth | Email + password, bcryptjs cost 12, JWT (jose, HS256) in an HttpOnly cookie |
| Database | Supabase PostgreSQL via Prisma |
| Spec storage | Original text in `ApiVersion.content`; no object storage |
| Comparison engine | Go HTTP service running pinned oasdiff |
| Change source | `oasdiff diff -f json` only |
| Stored result | One `DetectedChange` row per change; exact raw stdout on the comparison; warnings on the comparison |
| Counts | Computed by the web app from stored changes |
| Source diff | Canonicalized text diff computed in Next.js, no engine call |
| Deployment | Docker Compose, local, Supabase as the external database |
| Target quality | Demo-grade, but complete, deterministic, tested end-to-end |

### 1.1 Data flow

```
Browser
  │  Server Component (initial page data, Prisma read)
  │  JSON API (mutations, workspace export)
  ▼
Next.js web  ── Prisma ──►  Supabase PostgreSQL
  │
  │  POST /validate, POST /diff  (shared secret, 90 s timeout)
  ▼
Go comparison-service  ── fixed args ──►  oasdiff
```

Opening a saved comparison reads only PostgreSQL. It must never import or call `comparison-client.ts`.

---

## 2. Scope

### 2.1 Included

- Register, log in, log out.
- Create, edit, and delete projects. A project belongs to one user.
- Upload OpenAPI 3.0.x and 3.1.x files in YAML or JSON as immutable versions of a project.
- Compare any two different versions of the same project.
- Change tree grouped by endpoint, component, and category.
- Old/new values for each change, presence flags, and transitive `usedBy` endpoints for component changes.
- Counts and breakdowns for each comparison.
- Search and filters within a comparison, persisted in the URL.
- Source diff tab using canonicalized text.
- Raw viewer for each version.
- Saved comparisons; reopening reads stored data only.
- JSON export of a comparison.
- Delete a comparison (the API already existed in v1; the UI now exposes it).
- Run the full stack with `docker compose up`.

### 2.2 Excluded

- AI features of any kind.
- Breaking, warning, severity, compatibility, or safety labels anywhere in the app.
- Release notes, changelogs, or “recommended action” output.
- Team accounts, sharing, public links, comments, email invitations.
- Editing or deleting uploaded versions.
- Background jobs, queues, websockets, streaming progress.
- PDF or HTML reports.
- Cross-project search.
- Cloud deployment, CI/CD as a deliverable, SSO, password reset, email verification.
- OAuth or any third-party auth.

### 2.3 Accepted limitations

- JWTs cannot be revoked. Logout clears the cookie only.
- No email verification; accounts are usable immediately.
- No password reset in the demo.
- Auth rate limiting is in-memory and resets on restart; it is a speed bump, not a security boundary.
- Source-diff line numbers refer to canonical text, not the uploaded file.
- Comparisons are immutable; comparing the same pair again creates a new record.
- Change lists are capped by `MAX_CHANGES_PER_COMPARISON` rather than paginated.

---

## 3. Repository state and target layout

### 3.1 Current state (checked during this review)

| Path | Current state | Required action |
|---|---|---|
| `web/` | `create-next-app` scaffold: `app/`, no `src/`, `cacheComponents: true`, `partialPrefetching: true`, `experimental.agentFeedback` | Move to `src/`, apply section 4.3 config, remove scaffold demo content |
| `comparision-service/` | Misspelled folder; `hello.go`, `v1.yaml`, `v2.yaml`, `diff.json`, `breaking.json` | Rename to `comparison-service/`; move seed files to `docs/day1/`; delete `hello.go`; never use `breaking.json` at runtime |
| `docs/` | Empty | Add `notes.md` and `decisions.md` |
| `DIFFORA.md` | v1 | This v2 file |
| Git | Not a repository | `git init`, root `.gitignore`, initial commit before feature work |
| `web/AGENTS.md` | Next.js agent rules | Keep; read the Next docs it points to before coding |

### 3.2 Target layout

```text
Diffora/
├── DIFFORA.md                        # this specification
├── README.md                         # setup, run, test, troubleshooting
├── docker-compose.yml                # web + comparison-service + one-shot migrate
├── docker-compose.test.yml           # local PostgreSQL for tests/CI
├── .gitignore
├── .dockerignore
├── docs/
│   ├── notes.md                      # oasdiff findings, versions, checksums, parity notes
│   ├── decisions.md                  # short ADR-style decision log
│   └── day1/                         # seed specs, raw diff samples, breaking.json (reference only)
├── comparison-service/
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── httpapi/                  # handlers, auth middleware, errors, request ids
│   │   ├── oasdiff/                  # pinned binary runner, output caps, timeouts
│   │   ├── specs/                    # YAML 1.2 → JSON conversion, limits
│   │   ├── normalize/                # raw diff → []DetectedChange
│   │   ├── pointer/                  # JSON Pointer + $ref resolution
│   │   └── model/                    # request, response, change, warning structs
│   ├── testdata/pairs/<name>/
│   │   ├── base.yaml
│   │   ├── target.yaml
│   │   ├── raw.expected.json         # exact `oasdiff diff` output
│   │   └── expected.json             # normalized changes + warnings
│   ├── go.mod
│   ├── go.sum
│   └── Dockerfile
└── web/
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/
    │   └── seed.ts                   # optional dev data
    ├── src/
    │   ├── app/
    │   │   ├── (auth)/login/page.tsx
    │   │   ├── (auth)/register/page.tsx
    │   │   ├── (app)/layout.tsx
    │   │   ├── (app)/loading.tsx
    │   │   ├── (app)/dashboard/page.tsx
    │   │   ├── (app)/projects/[projectId]/page.tsx
    │   │   ├── (app)/versions/[versionId]/page.tsx
    │   │   ├── (app)/comparisons/[comparisonId]/page.tsx
    │   │   ├── api/...               # section 9
    │   │   ├── layout.tsx
    │   │   ├── page.tsx
    │   │   ├── error.tsx
    │   │   ├── not-found.tsx
    │   │   └── globals.css
    │   ├── components/
    │   │   ├── ui/                   # shadcn
    │   │   ├── auth/
    │   │   ├── projects/
    │   │   ├── versions/
    │   │   ├── comparison/           # summary-header, change-tree, change-detail,
    │   │   │                         # change-filters, source-diff, counts-panel
    │   │   └── layout/               # top bar, theme toggle, mobile nav
    │   ├── lib/
    │   │   ├── auth.ts               # JWT, cookie, getCurrentUser, requireUser
    │   │   ├── db.ts                 # Prisma singleton
    │   │   ├── env.ts                # Zod env validation
    │   │   ├── errors.ts             # AppError, code → status, JSON error helper
    │   │   ├── api.ts                # request parsing, ownership helpers, no-store
    │   │   ├── comparison-client.ts  # HTTP client for the Go service
    │   │   ├── changes.ts            # toChangeRow
    │   │   ├── spec-parse.ts         # YAML/JSON parsing, metadata extraction
    │   │   ├── canonical-spec.ts     # canonical JSON (section 15)
    │   │   ├── counts.ts             # counts and breakdowns (section 14)
    │   │   ├── validation.ts         # Zod request/response schemas
    │   │   └── formatting.ts         # dates, bytes, truncation, labels
    │   ├── types/changes.ts          # Zod change contract (section 13)
    │   └── proxy.ts                  # Next 16 proxy (replaces middleware.ts)
    ├── tests/
    │   ├── unit/
    │   ├── integration/
    │   └── e2e/                      # Playwright
    ├── vitest.config.ts
    ├── playwright.config.ts
    ├── .env.example
    ├── Dockerfile                    # targets: deps, build, migrator, runner
    ├── package.json
    └── next.config.ts
```

### 3.3 Phase 0 repository migration checklist

1. `git init` at the root; add `.gitignore`, `.dockerignore`.
2. Rename `comparision-service/` → `comparison-service/`.
3. Move `v1.yaml`, `v2.yaml`, `diff.json`, `breaking.json` to `docs/day1/`.
4. Delete `comparision-service/hello.go` after the Go module is initialised.
5. Move `web/app` → `web/src/app`; update `tsconfig.json` paths if needed.
6. Delete the scaffold demo content but keep `favicon.ico`, `globals.css` structure, and the Tailwind loader config.
7. Create `docs/notes.md` and `docs/decisions.md` with the templates in section 21.
8. Replace `web/README.md` with the real project README.

---

## 4. Technology and framework constraints

### 4.1 Runtime versions

| Tool | Version / decision |
|---|---|
| Node.js | 22 LTS (Docker `node:22-alpine`) |
| Go | Go 1.27.x (match the installed toolchain; pin in Docker) |
| Next.js | 16.4.6 |
| React | 19.3.0 |
| Tailwind CSS | 4.3.x |
| Prisma | Pin a version compatible with Node 22 and Supabase; verify in Phase 0 |
| PostgreSQL | Supabase-managed; local PostgreSQL 16 for tests |
| oasdiff | Exact release pinned in `docs/notes.md` and `comparison-service/Dockerfile` |

### 4.2 Next.js 16 rules that override v1

- **`proxy.ts`, not `middleware.ts`.** Export a function named `proxy` (or a default function) from `web/src/proxy.ts`. It runs in the Node.js runtime by default. Do not set `runtime` in the proxy file; it throws.
- Use `proxy` only to check the session cookie signature/expiry and to redirect unauthenticated page requests. Do not query Prisma from it.
- Dynamic route params are Promises: `{ params }: { params: Promise<{ projectId: string }> }`; always `await params`.
- `cookies()`, `headers()`, and page `searchParams` are async; always `await` them.
- Route handlers are dynamic by default; still set `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"` on authenticated handlers for clarity.
- Set `cacheComponents: false`. The app is authenticated and request-dependent; Cache Components would require extra Suspense and instant-navigation decisions that are outside this demo.
- Do not query PostgreSQL during `next build`. Mark `(app)/layout.tsx` with `export const dynamic = "force-dynamic"` and instantiate Prisma lazily so the Docker build works without database access.
- Use `output: "standalone"` for the Docker runtime.
- Add `serverExternalPackages: ["@prisma/client"]`.
- Remove `experimental.agentFeedback`.
- Keep the Tailwind Turbopack CSS rule from the scaffold unless the Tailwind/shadcn setup replaces it.

### 4.3 Required `next.config.ts` shape

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: false,
  serverExternalPackages: ["@prisma/client"],
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

Do not add a permissive CSP blindly. If a CSP is added, verify Next's inline scripts and shiki output in both dev and production. A strict CSP with nonces is a stretch goal, not a demo blocker.

### 4.4 Dependency decisions

Web:

- `next`, `react`, `react-dom`
- `@prisma/client`, `prisma` (CLI in `migrator` stage)
- `bcryptjs`, `jose`, `zod`
- `yaml`, `diff`
- `shiki`
- `sonner`, `next-themes`
- `lucide-react`
- shadcn/ui dependencies (`class-variance-authority`, `clsx`, `tailwind-merge`, Radix packages added by the CLI)
- `react-diff-viewer-continued` — verify React 19 compatibility in Phase 0; fallback is a custom `diffLines` renderer
- Dev: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@playwright/test`, `eslint`, `typescript`

Go:

- `gopkg.in/yaml.v3`
- standard library only for HTTP, JSON, process execution, and crypto

Run `npx shadcn@latest init` during Phase 0 and add the components used by the UI (`button`, `dialog`, `input`, `textarea`, `select`, `switch`, `tabs`, `badge`, `table`, `card`, `dropdown-menu`, `tooltip`, `sonner`). Commit `components.json`.

Do not add a data-fetching library, a form library, or a state manager unless a concrete need appears. Native `fetch`, React state, URL state, and Server Components are enough.

### 4.5 Browser and accessibility baseline

- Light and dark themes, system default, persisted by `next-themes`.
- Keyboard-operable dialogs, tabs, tree groups, and change list.
- Visible focus rings.
- Labels on every input.
- No color-only status indication.
- Responsive from 360 px upward; the comparison sidebar becomes a drawer below `lg`.

---

## 5. oasdiff contract

### 5.1 Exact commands

These are the only runtime invocations. No other oasdiff subcommand is used.

| Purpose | Exact command | Where |
|---|---|---|
| Validate one uploaded spec | `oasdiff validate input.json -f json --allow-external-refs=false` | Go `POST /validate` |
| Compare two specs | `oasdiff diff base.json target.json -f json --allow-external-refs=false` | Go `POST /diff` |
| Engine version | `oasdiff --version` | Go startup, cached; exposed by `/health` |

`--allow-external-refs=false` is a deliberate safety flag, not a change-filter. It prevents SSRF and remote file access. Record the decision in `docs/notes.md`.

If the pinned release does not support `--allow-external-refs=false`:

1. Do not upgrade silently.
2. Reject every `$ref` that does not start with `#` in the Go converter, and reject absolute `$id` values.
3. Record the fallback in `docs/notes.md`.

### 5.2 Rules

- Arguments are fixed. No user text is ever passed as an argument.
- The working directory is the temporary directory that holds `base.json` and `target.json`.
- The engine runs as a child process with a context timeout and no shell.
- Only `diff -f json` is the source of changes. Raw output is kept exactly.
- The engine version is pinned in the Go Dockerfile and in `docs/notes.md`.
- Do not use `breaking`, `changelog`, `summary`, `checks`, `schema`, `flatten`, `upgrade`, `breaking-files`, or `git-diff-driver` at runtime.
- Do not pass flags that exclude changes, track extensions, or change path matching. The only non-format flags allowed are `--allow-external-refs=false` and the `-f json` format flag.

### 5.3 Validation semantics

- Exit `0`: valid. Warnings and info findings do not fail the default `--fail-on ERR`.
- Exit `1`: at least one error finding. Return 422 `INVALID_SPEC`.
- Exit `102`: the spec could not be loaded. Return 422 `INVALID_SPEC`.
- Exit `123`: the loader rejected a disallowed external reference. Return 422 `EXTERNAL_REF_NOT_SUPPORTED`.
- Timeout: 504 `TIMEOUT`.
- Any other exit: 500 `ENGINE_FAILED`.

The validate JSON is an array of findings:

```json
[
  {
    "id": "path-parameters-mismatch",
    "text": "operation DELETE /pets/{petId} must define exactly all path parameters (missing: [petId])",
    "level": 3,
    "section": "paths",
    "source": { "file": "v1.yaml", "line": 22, "column": 3 }
  }
]
```

Return to the user only a sanitized message:

```text
Spec validation failed: operation DELETE /pets/{petId} must define exactly all path parameters (missing: [petId]) (line 22)
```

Do not return `id`, `level`, `fingerprint`, `file`, or words such as `error`, `warning`, or `info` from the engine. The web app must not display engine severities.

### 5.4 Output caps

The Go service enforces:

| Cap | Default | Behaviour when exceeded |
|---|---|---|
| `MAX_REQUEST_BYTES` | 20 MiB | 413 `PAYLOAD_TOO_LARGE` |
| `MAX_ENGINE_STDOUT_BYTES` | 32 MiB | 422 `OUTPUT_TOO_LARGE` |
| `MAX_CHANGES` | 5000 | 422 `TOO_MANY_CHANGES` |

Keep the web `MAX_CHANGES_PER_COMPARISON` and Go `MAX_CHANGES` equal. A contract test asserts the effective values match after configuration.

### 5.5 Day 0 engine gate (mandatory)

Before normalizer code:

1. Install the exact release locally; record the tag, commit, OS, and SHA-256 in `docs/notes.md`.
2. Run `oasdiff validate --help`, `oasdiff diff --help`, and `oasdiff validate -f json` to confirm the flags used here.
3. Run `oasdiff validate` on every fixture. Fix the fixtures until every one except `invalid-target` exits 0.
4. Run `oasdiff diff` on every fixture and save `raw.expected.json`.
5. Confirm the real key names: `max`, `min`, `exclusiveMax`, `operationID`, `securityRequirements`, lower-cased header keys, and `type` as `{ added, deleted }`.
6. Update section 12 and `docs/notes.md` with any additional shapes found.
7. Only then write the normalizer.

The installed `oasdiff --version` in the current environment reports `main`. That is not a pin. Fix this in Phase 0.

---

## 6. Environment and configuration

### 6.1 `web/.env.example`

```dotenv
# Database
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5&sslmode=require
DIRECT_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres?sslmode=require

# Auth
JWT_SECRET=change-me-to-at-least-32-random-bytes
COOKIE_SECURE=false
APP_ORIGIN=http://localhost:3000

# Comparison service
COMPARISON_SERVICE_URL=http://comparison-service:8080
COMPARISON_SHARED_SECRET=change-me-too
COMPARISON_TIMEOUT_MS=90000

# Limits
MAX_SPEC_BYTES=2097152
MAX_UPLOAD_REQUEST_BYTES=6291456
MAX_RAW_DIFF_BYTES=33554432
MAX_DIFF_RESPONSE_BYTES=67108864
MAX_CHANGES_PER_COMPARISON=5000

# Optional
LOG_LEVEL=info
```

### 6.2 `comparison-service/.env.example`

```dotenv
PORT=8080
SHARED_SECRET=change-me-too
OASDIFF_BIN=oasdiff
VALIDATE_TIMEOUT_SECONDS=20
DIFF_TIMEOUT_SECONDS=60
MAX_REQUEST_BYTES=20971520
MAX_ENGINE_STDOUT_BYTES=33554432
MAX_CHANGES=5000
```

### 6.3 Environment validation

`web/src/lib/env.ts` validates at module load with Zod and fails fast with a clear server-side error:

- `DATABASE_URL`, `DIRECT_URL` are non-empty URLs.
- `JWT_SECRET` is at least 32 bytes.
- `COMPARISON_SHARED_SECRET` is non-empty and not the example value in production.
- `APP_ORIGIN` is an absolute `http`/`https` URL.
- Numeric limits are positive integers.
- `COOKIE_SECURE` is a boolean string.
- `COMPARISON_TIMEOUT_MS` is greater than the Go diff timeout plus a margin.

Go validates its config at startup and exits non-zero on missing secrets, invalid ports, or unavailable `OASDIFF_BIN`.

### 6.4 Cookie security decision

`COOKIE_SECURE` controls the `Secure` attribute:

- Local Docker over `http://localhost:3000`: `false`, otherwise login is broken.
- Any HTTPS deployment: `true`.
- Do not infer from `NODE_ENV`.

`SameSite=Lax`, `HttpOnly`, `Path=/`, `Max-Age=604800`.

### 6.5 Timeout budget

| Layer | Timeout |
|---|---|
| Go validate process | 20 s |
| Go diff process | 60 s |
| Web → Go HTTP request | 90 s |
| Prisma interactive transaction | 60 s, `maxWait` 5 s |
| DB health check | 2 s |
| Browser fetch for mutations | 120 s |

The web timeout must be longer than the Go diff timeout so the service can return its own 504.

---

## 7. Authentication and authorization

### 7.1 Passwords

- Hash with `bcryptjs`, cost 12.
- Minimum 8 characters, maximum 72 **bytes** (bcrypt truncation limit). Validate bytes, not code units.
- Store only `passwordHash`; never return or log it.
- Registration: trim `name`; normalize `email` to trimmed lowercase; validate with Zod.
- Duplicate email returns 409 `EMAIL_TAKEN`.
- Login: normalize the email; compare with bcrypt. Unknown email and wrong password return the same 401 `INVALID_CREDENTIALS`. To reduce timing differences, compare against a fixed dummy hash when the user is not found.

### 7.2 Tokens and cookies

- Library: `jose`, algorithm HS256, secret `JWT_SECRET`.
- Claims: `sub` (user id), `iat`, `exp`, `iss: "diffora"`, `aud: "diffora-web"`. The issuer and audience are required and must be verified.
- Expiry: 7 days.
- Cookie name: `diffora_session`.
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800`, `Secure` when `COOKIE_SECURE=true`.
- Logout clears the cookie with the same attributes. Tokens are not revocable; this is accepted.

### 7.3 Auth routes

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | 201 `{ user }` |
| POST | `/api/auth/login` | `{ email, password }` | 200 `{ user }` |
| POST | `/api/auth/logout` | none | 204 |
| GET | `/api/auth/me` | none | 200 `{ user }` or 401 |

`user = { id, name, email }`. Never include `passwordHash` or timestamps unless needed.

### 7.4 Data-access layer

`web/src/lib/auth.ts`:

```ts
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get("diffora_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "diffora",
      audience: "diffora-web",
    });
    if (typeof payload.sub !== "string") return null;
    return await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true },
    });
  } catch {
    return null;
  }
});
```

`requireUser()` throws `AppError(401, "UNAUTHORIZED")`. Every API route except `/api/auth/*` and `/api/health` calls it first.

### 7.5 Page-level enforcement

- `web/src/proxy.ts` verifies the cookie signature and expiry with `jose`. It does not query the database.
- `proxy` matcher excludes `/api`, `/_next`, static files, and `favicon.ico`.
- If a protected page request has no valid cookie, redirect to `/login?next=<path>`.
- Do **not** redirect `/login` or `/register` from the proxy based only on cookie signature. The auth page Server Component calls `getCurrentUser()` and redirects to `/dashboard` only when a real user exists. This avoids a redirect loop when a cookie is valid but the user row was deleted.
- `/` calls `getCurrentUser()` and redirects to `/dashboard` when signed in, otherwise `/login`.
- `(app)/layout.tsx` calls `getCurrentUser()` and redirects to `/login` if null. This is the authoritative page check; proxy is the fast path.
- Validate the `next` query parameter: allow only same-origin paths starting with `/` and not `//`. No open redirects.
- When an API returns 401, the client clears local UI state, shows a toast, and redirects to `/login`.

### 7.6 Ownership rules

- Project route: `project.userId === user.id`.
- Version route: `version.project.userId === user.id`.
- Comparison route: `comparison.project.userId === user.id`.
- Use `findFirst({ where: { id, userId } })` so a mismatch naturally returns `null` → 404. Never return 403 for ownership mismatches.
- Invalid UUIDs return 404, not 500.
- All page queries apply the same ownership filter.

### 7.7 CSRF and request-origin checks

- Mutating routes accept only `application/json`, except the multipart upload route.
- `SameSite=Lax` is set on the session cookie.
- For mutating requests, if `Origin` is present, it must match `APP_ORIGIN`. If `Sec-Fetch-Site` is present, it must be `same-origin` or `none`. Otherwise return 403 `INVALID_ORIGIN`.
- Multipart uploads still go through the origin check.
- Do not implement CSRF tokens for the demo; the combination above is sufficient for this scope.

### 7.8 Rate limiting (best effort)

- In-memory fixed window per `(route, ip, email)` for login/register.
- Login: 10 attempts per minute per email and 30 per minute per IP.
- Register: 10 per hour per IP.
- Return 429 `RATE_LIMITED` with `Retry-After`.
- This resets on restart and is not shared across replicas. Document it as a demo limitation.

---

## 8. Database

Prisma with Supabase PostgreSQL. Migrations use `DIRECT_URL`; runtime queries use the pooled `DATABASE_URL`.

### 8.1 `web/prisma/schema.prisma`

> **v3 supersedes this schema.** Do not create `DetectedChange` or the normalizer tables. Use the `Comparison` fields and `ComparisonFinding` rows described in the v3 block at the top of this document. The schema below is retained only as historical reference.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id           String    @id @default(uuid()) @db.Uuid
  email        String    @unique @db.VarChar(320)
  name         String    @db.VarChar(100)
  passwordHash String    @db.VarChar(60)
  createdAt    DateTime  @default(now()) @db.Timestamptz(3)
  projects     Project[]
}

model Project {
  id          String       @id @default(uuid()) @db.Uuid
  userId      String       @db.Uuid
  name        String       @db.VarChar(100)
  description String?      @db.VarChar(500)
  createdAt   DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime     @updatedAt @db.Timestamptz(3)
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  versions    ApiVersion[]
  comparisons Comparison[]

  @@index([userId, updatedAt])
}

model ApiVersion {
  id               String       @id @default(uuid()) @db.Uuid
  projectId        String       @db.Uuid
  label            String       @db.VarChar(50)
  labelNormalized  String       @db.VarChar(50) // trimmed + lowercase
  description      String?      @db.VarChar(500)
  openapiVersion   String       @db.VarChar(20)
  specFormat       String       @db.VarChar(5) // "yaml" | "json"
  originalFilename String       @db.VarChar(255)
  fileSize         Int
  checksum         String       @db.VarChar(64)
  title            String       @db.VarChar(300)
  content          String       @db.Text
  createdAt        DateTime     @default(now()) @db.Timestamptz(3)
  project          Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  baseOf           Comparison[] @relation("baseVersion")
  targetOf         Comparison[] @relation("targetVersion")

  @@unique([projectId, labelNormalized])
  @@index([projectId, createdAt])
  @@index([projectId, checksum])
}

model Comparison {
  id              String           @id @default(uuid()) @db.Uuid
  projectId       String           @db.Uuid
  baseVersionId   String           @db.Uuid
  targetVersionId String           @db.Uuid
  status          String           @db.VarChar(10) // "completed" | "failed"
  totalAdded      Int              @default(0)
  totalRemoved    Int              @default(0)
  totalModified   Int              @default(0)
  totalChanges    Int              @default(0)
  engineVersion   String           @db.VarChar(64)
  durationMs      Int              @default(0)
  rawDiffText     String?          @db.Text // exact stdout
  rawDiffBytes    Int              @default(0)
  warnings        Json             @default("[]")
  errorMessage    String?          @db.Text
  createdAt       DateTime         @default(now()) @db.Timestamptz(3)
  project         Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  baseVersion     ApiVersion       @relation("baseVersion", fields: [baseVersionId], references: [id], onDelete: Cascade)
  targetVersion   ApiVersion       @relation("targetVersion", fields: [targetVersionId], references: [id], onDelete: Cascade)
  changes         DetectedChange[]

  @@index([projectId, createdAt])
  @@index([baseVersionId])
  @@index([targetVersionId])
  @@index([createdAt])
}

model DetectedChange {
  id              String     @id @default(uuid()) @db.Uuid
  comparisonId    String     @db.Uuid
  position        Int
  category        String     @db.VarChar(20)
  changeType      String     @db.VarChar(10)
  path            String?    @db.Text
  method          String?    @db.VarChar(10)
  groupKey        String     @db.VarChar(400)
  isDocumentation Boolean    @default(false)
  data            Json
  comparison      Comparison @relation(fields: [comparisonId], references: [id], onDelete: Cascade)

  @@unique([comparisonId, position])
  @@index([comparisonId, category])
  @@index([comparisonId, changeType])
  @@index([comparisonId, groupKey])
  @@index([comparisonId, isDocumentation])
}
```

Notes:

- Verify `Json @default("[]")` against the chosen Prisma version during Phase 1. If it is not supported, remove the default and always write `warnings` explicitly.
- Add optional SQL check constraints in the initial migration:
  - `status IN ('completed', 'failed')`
  - `"baseVersionId" <> "targetVersionId"`
  - `"totalChanges" = "totalAdded" + "totalRemoved" + "totalModified"`
  - `"position" >= 0`
- Prisma does not manage check constraints; add them in a hand-edited migration and keep them tested.

### 8.2 Storage rules

- `data` stores the complete `DetectedChange` object from section 13, including unknown fields. Nothing is stripped.
- Indexed columns are written only by `toChangeRow()` (section 8.5). No other code writes them.
- `position` is the zero-based index in the sorted list.
- `rawDiffText` is the exact stdout bytes decoded as UTF-8. Do not reformat, re-sort, or re-serialize it before storage.
- `warnings` stores only normalization warnings, never oasdiff severities.

### 8.3 Presence of values

`oldValue` and `newValue` live inside `data`. Presence is recorded by `oldValuePresent` and `newValuePresent`.

- Absent: flag `false`, value key omitted.
- Present JSON `null`: flag `true`, value key present with `null`.
- Any other value: flag `true`, value stored as JSON.

Readers check the flags, not whether the key exists. Do not use `Prisma.DbNull` or `Prisma.JsonNull` for these nested values. Never display `null` for an absent side; use “Not present in this version”.

### 8.4 Component-attributed values

A component-attributed change may have different base and target components (for example, a request body switched from `$ref: A` to `$ref: B`). `basePointer` and `targetPointer` are resolved independently. It is valid for them to name different components. `displayPointer` reports the target pointer when present, otherwise the base pointer.

### 8.5 `toChangeRow()`

`web/src/lib/changes.ts`:

```ts
import type { DetectedChange } from "@/types/changes";

export function toChangeRow(
  change: DetectedChange,
  position: number,
  comparisonId: string,
) {
  return {
    comparisonId,
    position,
    category: change.category,
    changeType: change.changeType,
    path: change.path ?? null,
    method: change.method ?? null,
    groupKey: change.groupKey,
    isDocumentation: change.isDocumentation,
    data: change,
  };
}
```

### 8.6 Deletion

- Versions are never deleted by the application.
- Deleting a project cascades to versions and comparisons.
- Deleting a comparison cascades to its changes.
- A test must confirm the project-delete cascade.

### 8.7 Connections and migrations

- `DATABASE_URL`: Supabase transaction pooler, port 6543, with `pgbouncer=true`, `connection_limit=5`, `sslmode=require`.
- `DIRECT_URL`: used only by `prisma migrate`/`migrate deploy`.
- Supabase direct hosts may be IPv6-only on some networks. If migrations fail to connect, use the Supabase **session pooler** on port 5432 as `DIRECT_URL` and record the workaround in `docs/notes.md`.
- Interactive transactions over `pgbouncer` transaction mode require `pgbouncer=true`; verify in Phase 4 with a 5000-change insert. If transaction-mode pooling causes failures, use the session pooler for the web runtime or reduce batching.
- Local development and tests use the local PostgreSQL in `docker-compose.test.yml`.
- Never run `prisma migrate dev` against production.

---

## 9. Next.js API

### 9.1 Conventions

- All route handlers run on Node.js: `export const runtime = "nodejs"`.
- Authenticated handlers: `export const dynamic = "force-dynamic"`.
- Bodies are JSON unless noted.
- Request bodies are parsed with Zod; query parameters are validated too.
- Error shape:

```json
{
  "error": {
    "code": "CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

`details` is optional. It may contain `comparisonId` or field-level validation errors. It never contains stack traces, file paths, spec content, secrets, or engine severities.

- Every authenticated response sets `Cache-Control: no-store`.
- Unknown routes/methods return the same error shape.

### 9.2 Canonical error codes

| Code | HTTP | Service | When |
|---|---|---|---|
| `INVALID_INPUT` | 400 | web | Zod/body/query validation failed |
| `INVALID_ORIGIN` | 403 | web | Origin/Sec-Fetch-Site mismatch |
| `UNAUTHORIZED` | 401 | web, go | Not signed in or missing/wrong shared secret |
| `INVALID_CREDENTIALS` | 401 | web | Unknown email or wrong password |
| `NOT_FOUND` | 404 | web | Missing or not owned |
| `METHOD_NOT_ALLOWED` | 405 | web | Unsupported method |
| `EMAIL_TAKEN` | 409 | web | Duplicate normalized email |
| `DUPLICATE_LABEL` | 409 | web | Duplicate normalized version label |
| `PAYLOAD_TOO_LARGE` | 413 | web, go | Request/body too large |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | web, go | Not JSON where JSON is required |
| `FILE_TOO_LARGE` | 413 | web | Uploaded file exceeds `MAX_SPEC_BYTES` |
| `UNSUPPORTED_EXTENSION` | 400 | web | Filename is not `.yaml`, `.yml`, or `.json` |
| `INVALID_ENCODING` | 400 | web | Not valid UTF-8 |
| `UNSUPPORTED_OPENAPI_VERSION` | 422 | web | Not OpenAPI 3.0.x/3.1.x |
| `INVALID_SPEC` | 422 | web, go | Parse/validation failure |
| `EXTERNAL_REF_NOT_SUPPORTED` | 422 | go | Non-fragment `$ref` or absolute `$id` |
| `UNSUPPORTED_YAML_TAG` | 422 | go | Custom/binary/set YAML tag |
| `UNSUPPORTED_VALUE` | 422 | web, go | NaN/Infinity/cycle/unsupported scalar |
| `TOO_MANY_CHANGES` | 422 | web, go | Exceeds `MAX_CHANGES` |
| `OUTPUT_TOO_LARGE` | 422 | go | Engine output exceeds caps |
| `SAME_VERSION` | 400 | web | Base and target ids are equal |
| `VERSION_NOT_IN_PROJECT` | 400 | web | A version belongs to another project |
| `BAD_COMPARISON_RESPONSE` | 502 | web | Go response fails Zod validation |
| `COMPARISON_UNAVAILABLE` | 502 | web | Network/connection failure to Go |
| `COMPARISON_TIMEOUT` | 504 | web | Go returned 504 |
| `TIMEOUT` | 504 | go | Engine process timed out |
| `ENGINE_FAILED` | 500 | go | Engine failed for an unknown reason |
| `RATE_LIMITED` | 429 | web | Best-effort auth limit exceeded |
| `INTERNAL` | 500 | web, go | Unexpected error |

### 9.3 Auth routes

As in section 7.3.

Register validation:

- `name`: 1–100 characters after trim.
- `email`: valid email, max 320 characters, normalized lowercase.
- `password`: 8–72 bytes.

Login validation: `email`, `password` non-empty.

Logout: 204, clears cookie.

### 9.4 Projects

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/api/projects` | none | 200 `{ projects }` |
| POST | `/api/projects` | `{ name, description? }` | 201 `{ project }` |
| GET | `/api/projects/:projectId` | none | 200 `{ project, versions, comparisons }` |
| PATCH | `/api/projects/:projectId` | `{ name?, description? }` | 200 `{ project }` |
| DELETE | `/api/projects/:projectId` | none | 204 |

- `name`: 1–100 characters after trim.
- `description`: up to 500 characters; empty string becomes `null`.
- `GET /api/projects` returns projects for the current user, ordered by `updatedAt desc`, limit 100. Each entry is `{ id, name, description, createdAt, updatedAt, versionCount, comparisonCount }`.
- `versions` entries: `{ id, label, openapiVersion, specFormat, fileSize, createdAt }`, newest first, limit 100.
- `comparisons` entries: `{ id, baseVersion: { id, label }, targetVersion: { id, label }, totalAdded, totalRemoved, totalModified, totalChanges, status, createdAt }`, newest first, limit 100.
- PATCH: at least one field must be present; an empty body is 400 `INVALID_INPUT`.
- DELETE: cascades; 204 even if already gone after ownership check.

### 9.5 Versions

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/projects/:projectId/versions` | multipart: `file`, `label`, `description?` | 201 `{ version }` |
| GET | `/api/versions/:versionId` | none | 200 `{ version }` |
| GET | `/api/versions/:versionId/raw` | none | 200 `text/plain; charset=utf-8` |

- `version` summary: `{ id, projectId, label, description, openapiVersion, specFormat, originalFilename, fileSize, checksum, title, createdAt }`.
- No `content` in the normal version response.
- Raw response headers: `Content-Type: text/plain; charset=utf-8`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Content-Disposition: inline; filename="<sanitized>"`, `Cache-Control: private, no-store`.
- Filename in `Content-Disposition` is sanitized to ASCII-safe characters and quoted.
- Label: 1–50 characters after trim; stored as given; `labelNormalized` is trimmed + lowercase.
- Duplicate normalized label: 409 `DUPLICATE_LABEL`.
- `file`: at most `MAX_SPEC_BYTES`.
- No edit or delete version routes.

### 9.6 Comparisons

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/projects/:projectId/comparisons` | `{ baseVersionId, targetVersionId }` | 201 `{ comparison }` |
| GET | `/api/comparisons/:comparisonId` | none | 200 `{ comparison }` |
| GET | `/api/comparisons/:comparisonId/changes` | none | 200 `{ changes }` |
| GET | `/api/comparisons/:comparisonId/export` | none | 200 JSON attachment |
| DELETE | `/api/comparisons/:comparisonId` | none | 204 |

`comparison`:

```ts
{
  id: string;
  projectId: string;
  baseVersion: { id: string; label: string; title: string };
  targetVersion: { id: string; label: string; title: string };
  status: "completed" | "failed";
  totalAdded: number;
  totalRemoved: number;
  totalModified: number;
  totalChanges: number;
  engineVersion: string;
  durationMs: number;
  warnings: NormalizationWarning[];
  errorMessage: string | null;
  createdAt: string;
}
```

Rules:

- `baseVersionId` and `targetVersionId` must differ: 400 `SAME_VERSION`.
- Both versions must belong to the project in the URL: 400 `VERSION_NOT_IN_PROJECT`.
- Comparisons are immutable. Comparing the same pair again creates a new record.
- A failed comparison is returned by GET with zero counts, `status: "failed"`, and `errorMessage`.
- `changes` returns every stored row's `data`, ordered by `position`. It returns `[]` for a failed comparison. There is no truncation.
- Delete a comparison returns 204 and cascades to changes. The UI must confirm before deleting.
- Export filename: `diffora-comparison-<id>.json`.
- Export body:

```json
{
  "exportVersion": 1,
  "exportedAt": "ISO timestamp",
  "comparison": {},
  "changes": [],
  "rawDiff": {}
}
```

- For a failed comparison, export includes `changes: []`, `rawDiff: null`, and `errorMessage` inside `comparison`.
- `rawDiff` is parsed from `rawDiffText`; if parsing fails, that is a server error and must be logged without exposing the text.

### 9.7 Failed comparison response

When the comparison service fails, v1 created a failed row but returned only an error. v2 returns:

```json
{
  "error": {
    "code": "COMPARISON_UNAVAILABLE",
    "message": "The comparison service could not be reached.",
    "details": { "comparisonId": "uuid" }
  }
}
```

The client navigates to `/comparisons/<comparisonId>` when `details.comparisonId` is present. If the failed-row insert itself fails, return 500 `INTERNAL` with no id.

### 9.8 Health

`GET /api/health`:

- No auth.
- Runs `SELECT 1` with a 2 s timeout.
- 200 `{ status: "ok", db: "ok" }` or 503 `{ status: "degraded", db: "unreachable" }`.
- No secrets, versions, or connection strings.

### 9.9 Cache headers

- Auth, project, version, comparison, changes, export, and health responses: `Cache-Control: no-store`.
- Static assets are handled by Next.
- Raw viewer: `private, no-store`.

---

## 10. Upload and comparison procedures

### 10.1 Upload

Inside `POST /api/projects/:projectId/versions`:

1. Authenticate and check project ownership. Invalid UUIDs → 404.
2. Require `Content-Type: multipart/form-data`; otherwise 415 `UNSUPPORTED_MEDIA_TYPE`.
3. If `Content-Length` is present and greater than `MAX_UPLOAD_REQUEST_BYTES`, return 413 `PAYLOAD_TOO_LARGE` before reading the body. If it is absent (chunked transfer), rely on `file.size` after parsing; `formData()` buffers, so this is an accepted demo limitation. A streaming parser is the production fix.
4. Read the multipart form. If it throws, return 400 `INVALID_INPUT`. If `file` or `label` is missing, return 400 `INVALID_INPUT`.
5. Reject `file.size > MAX_SPEC_BYTES` with 413 `FILE_TOO_LARGE`.
6. Reject an empty file with 422 `INVALID_SPEC`.
7. Filename extension is case-insensitive and must be `.yaml`, `.yml`, or `.json`; otherwise 400 `UNSUPPORTED_EXTENSION`. Store `originalFilename` as uploaded, truncated to 255 characters for storage.
8. Read bytes. Decode with `new TextDecoder("utf-8", { fatal: true })`; on failure return 400 `INVALID_ENCODING`.
9. Strip a leading UTF-8 BOM for parsing only. Store the original decoded text unmodified.
10. Reject NUL bytes with 422 `INVALID_SPEC`.
11. Reject multiple YAML documents with 422 `INVALID_SPEC`.
12. Parse with `JSON.parse` first when the extension is `.json` or the content starts with `{`/`[`; otherwise parse YAML. If JSON parsing fails and the extension is `.json`, return 422 `INVALID_SPEC`; do not silently fall back to YAML for a `.json` file. For `.yaml`/`.yml`, parse YAML.
13. Set `specFormat` to `"json"` or `"yaml"` based on the parser that succeeded.
14. The document must be a non-null object. `openapi` must be a string or number that matches `^3\.(0|1)(\.\d+)?$`. Otherwise 422 `UNSUPPORTED_OPENAPI_VERSION`.
15. `info` must be an object. Read `info.title`; if missing, not a string, or empty after trim, use the filename. Truncate the stored title to 300 characters.
16. Reject non-JSON values that would break canonicalization: `NaN`, `Infinity`, cycles, `BigInt`, custom YAML tags, and non-string map keys that cannot be represented safely.
17. Call the comparison service `POST /validate` with `{ content, format }`.
    - 422 → pass through a sanitized message with status 422 and code `INVALID_SPEC`.
    - 401 → configuration error; log and return 502 `COMPARISON_UNAVAILABLE` without leaking the secret.
    - 502/504/network → 502 `COMPARISON_UNAVAILABLE` or 504 `COMPARISON_TIMEOUT`.
18. Compute SHA-256 over the stored UTF-8 content bytes. Store lowercase hex.
19. In one transaction, insert `ApiVersion` with `content` exactly as decoded (including BOM, excluding no characters) and touch the project’s `updatedAt`. A unique violation on `(projectId, labelNormalized)` returns 409 `DUPLICATE_LABEL`.
20. Return 201 with the version summary.

Do not rewrite the stored content. Do not normalize line endings.

### 10.2 Comparison

Inside `POST /api/projects/:projectId/comparisons`:

1. Authenticate and check project ownership.
2. Validate the body with Zod.
3. Load both versions with `projectId` in the where clause. If either is missing from the project, 400 `VERSION_NOT_IN_PROJECT`.
4. If the ids are equal, 400 `SAME_VERSION`.
5. Call the comparison service `POST /diff` with both contents and formats, `X-Request-Id`, and a 90 s timeout.
   - Network failure → 502 `COMPARISON_UNAVAILABLE`.
   - 504 → 504 `COMPARISON_TIMEOUT`.
   - 422 with a known code → pass through 422.
   - 5xx → 502 `COMPARISON_UNAVAILABLE`.
6. Read the response body with a `MAX_DIFF_RESPONSE_BYTES` cap. Validate it with the Zod schema in `src/types/changes.ts`. Also parse `rawDiffText` and require a plain object; invalid → 502 `BAD_COMPARISON_RESPONSE`.
7. If `changes.length > MAX_CHANGES_PER_COMPARISON`, create a failed comparison with `errorMessage: "TOO_MANY_CHANGES"` and return 422.
8. Compute counts from the validated changes (section 14).
9. Write the comparison and changes in one interactive transaction with `timeout: 60000`, `maxWait: 5000`:
   a. Insert `Comparison` with `status: "completed"`, counts, `engineVersion`, `durationMs`, `rawDiffText`, `rawDiffBytes` (UTF-8 byte length of `rawDiffText`), and `warnings`; touch the project’s `updatedAt` in the same transaction.
   b. Insert `DetectedChange` rows with `createMany` in batches of 500, using `toChangeRow(change, index, comparisonId)`.
10. If step 5, 6, or 7 fails, insert a failed comparison row **outside** the transaction with zero counts, the known `engineVersion` when available (otherwise `"unknown"`), any available raw text, and a sanitized `errorMessage`. Return the original error with `details.comparisonId`.
11. If the failed-row insert fails, return 500 `INTERNAL`.
12. Return 201 with the comparison summary.

Reading a comparison (`GET` routes) only reads PostgreSQL. It must never import or call the comparison client. A test enforces this.

### 10.3 Concurrency and duplicates

- The Compare button is disabled while a request is in flight.
- The server does not deduplicate comparisons; the same pair creates a new record by design.
- No lock is needed because comparisons are synchronous and immutable.

---

## 11. Comparison service (Go)

> **v3 note:** this section and section 12 describe the abandoned normalizer. The implemented service is the thin proxy in the v3 block. Use the v3 response contract below; do not implement the normalizer.

A stateless HTTP service. It never touches the database. Only the web application calls it.

### 11.1 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | `{ "status": "ok", "engineVersion": "x.y.z" }` |
| POST | `/validate` | secret | Validate one spec |
| POST | `/diff` | secret | Compare two specs and return normalized changes |

Every request except `/health` must send `X-Shared-Secret`, compared in constant time. Missing/wrong → 401 `UNAUTHORIZED`.

### 11.2 HTTP server rules

- `Content-Type` must be `application/json` for POST; otherwise 415 `UNSUPPORTED_MEDIA_TYPE`.
- Body limited with `http.MaxBytesReader`.
- `ReadHeaderTimeout: 5s`, `ReadTimeout: 30s`, `WriteTimeout: 120s`, `IdleTimeout: 120s`.
- Panic recovery middleware returns 500 `INTERNAL` and logs the stack server-side.
- Log: route, status, duration, error code. Never log spec content, secrets, or full file paths.
- Graceful shutdown on `SIGINT`/`SIGTERM` with a 10 s deadline.
- `/health` returns the cached engine version. It does not spawn a process per request.

### 11.3 YAML → JSON conversion

The web app parses YAML for metadata and source diff; the Go service parses YAML for oasdiff. They must agree. Use a tag-aware converter, not the default `yaml.v3` `any` decode.

Rules:

- Parse with `yaml.Node`; reject a second document.
- Resolve scalars using a YAML 1.2 core-compatible table:
  - `null`, `Null`, `NULL`, `~`, empty → `null`.
  - `true`/`false` (case-insensitive) → boolean.
  - Integers: decimal, `0x`, `0o`; preserve precision with `json.Number`.
  - Floats: finite values only; reject `NaN`, `.inf`, `-.inf`.
  - Everything else, including `yes`, `no`, `on`, `off`, dates, and timestamps, is a **string**.
- Reject custom tags, `!!binary`, `!!set`, and unsupported tags with `UNSUPPORTED_YAML_TAG`.
- Convert every map to string keys. Non-string scalar keys use their literal text. If two keys collide after conversion, return `INVALID_SPEC` (duplicate key).
- Support merge keys (`<<`) if enabled; add a fixture.
- Limit aliases (1000), depth (100), and nodes (200,000). Exceeding a limit returns `INVALID_SPEC`.
- Encode with `encoding/json`. Map keys are sorted by the encoder, which is fine.
- Fixtures must cover: unquoted `200`, `yes`/`no`/`on`/`off`, dates, anchors/aliases, merge keys, duplicate keys, and a multi-document file.

Record the exact parity decisions in `docs/notes.md`.

### 11.4 External references

- Pass `--allow-external-refs=false` to both engine commands.
- Before invoking the engine, walk the JSON tree and reject:
  - any `$ref` string that does not start with `#`;
  - any absolute `$id` with a URI scheme (for example `https:`, `file:`).
- Return 422 `EXTERNAL_REF_NOT_SUPPORTED` with a message that does not include the offending URL.
- This is defence in depth even if the engine flag is present.

### 11.5 Process execution

- `exec.CommandContext` with the fixed arguments from section 5.1.
- `cmd.Dir` is the temp directory.
- Write `input.<yaml|json>`, `base.<yaml|json>`, and `target.<yaml|json>` with mode `0600`; temp dir mode `0700`. The uploaded content is written as-is; no conversion.
- `defer os.RemoveAll(tempDir)` on every path.
- `cmd.Stdin = nil`.
- Capture stdout/stderr through size-limited writers.
- Set `cmd.WaitDelay` to 5 s to avoid hanging on inherited pipes.
- On Unix, start the process in its own process group and kill the group on timeout. Use build-tagged process setup; on Windows, fall back to `cmd.Process.Kill()`.
- Never use a shell. Never interpolate user text into arguments.
- `OASDIFF_BIN` is validated at startup (`exec.LookPath`).

### 11.6 `POST /validate`

Request: `{ "content": string, "format": "yaml" | "json" }`

1. Validate the format. Missing content or format → 400 `BAD_REQUEST`.
2. Create a temp dir and write `input.yaml` or `input.json` with the uploaded content as-is (BOM stripped).
3. Run `oasdiff validate input.<ext> -f json --allow-external-refs=false` with the validate timeout.
4. Exit 0 → `{ "valid": true, "engineVersion": "x.y.z" }`.
5. Exit 1 or 102 → 422 `INVALID_SPEC` with a sanitized first error finding.
6. Exit 123 → 422 `EXTERNAL_REF_NOT_SUPPORTED`.
7. Timeout → 504 `TIMEOUT`.
8. Other → 500 `ENGINE_FAILED`.
9. Remove the temp directory.

Sanitize findings:

- Use `text` and `line` only.
- Drop `file`, `level`, `id`, `fingerprint`, and `section` if they contain paths or severity words.
- Truncate to 500 characters.
- Never return the word `error`, `warning`, `info`, `breaking`, or `compatible` from the engine.

### 11.7 `POST /diff`

Request:

```json
{
  "base": { "content": "string", "format": "yaml" | "json" },
  "target": { "content": "string", "format": "yaml" | "json" }
}
```

1. Validate both formats. Missing content/format → 400 `BAD_REQUEST`. Mixed YAML/JSON → 400 `FORMAT_MISMATCH`.
2. Create a temp dir and write `base.<ext>` and `target.<ext>` with the uploaded content as-is (BOM stripped).
3. Run the four commands from the v3 block with the diff timeout.
4. Timeout → 504 `TIMEOUT`.
5. Non-zero exit:
   - Exit 123 → 422 `EXTERNAL_REF_NOT_SUPPORTED`.
   - Parse/validation problem → 422 `INVALID_SPEC`.
   - Otherwise → 500 `ENGINE_FAILED`.
   - Include at most 500 characters of sanitized stderr.
6. Parse stdout as a JSON object. Empty object means no changes. An empty array is invalid → 500 `ENGINE_FAILED` (the engine should return an object).
7. Collect `changelog`, `summary`, and `breaking` from the other three commands. Enforce `MAX_CHANGES` on changelog/breaking; abort above the limit with 422 `TOO_MANY_CHANGES`.
8. Remove the temp directory.
9. Return the exact diff stdout plus the other engine outputs. `durationMs` measures the engine batch, not the HTTP layer:

```json
{
  "engineVersion": "x.y.z",
  "durationMs": 412,
  "rawDiffText": "{\"info\":...}",
  "changelog": [],
  "summary": { "diff": true, "details": {} },
  "breaking": [],
  "deprecations": []
}
```

The response does **not** include a parsed `rawDiff` object. This avoids sending the engine output twice. The web app:

- relies on the engine stdout cap (`MAX_ENGINE_STDOUT_BYTES`),
- parses it with `JSON.parse`,
- verifies the parsed value is a plain object,
- stores the exact text in `Comparison.rawDiffText`,
- parses it again only for export.

If `rawDiffText` does not parse to an object, the web app rejects the response with 502 `BAD_COMPARISON_RESPONSE` and records a failed comparison.

### 11.8 Errors

```json
{ "error": { "code": "CODE", "message": "string" } }
```

| Code | Status | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or wrong secret |
| `BAD_REQUEST` | 400 | Malformed body |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Not JSON |
| `PAYLOAD_TOO_LARGE` | 413 | Body exceeds the cap |
| `INVALID_SPEC` | 422 | Spec does not parse or engine rejects it |
| `EXTERNAL_REF_NOT_SUPPORTED` | 422 | Non-fragment `$ref`/absolute `$id` |
| `UNSUPPORTED_YAML_TAG` | 422 | Unsupported YAML tag |
| `TOO_MANY_CHANGES` | 422 | Change cap exceeded |
| `OUTPUT_TOO_LARGE` | 422 | Engine output cap exceeded |
| `TIMEOUT` | 504 | Engine timeout |
| `ENGINE_FAILED` | 500 | Engine failed otherwise |
| `INTERNAL` | 500 | Anything else |

### 11.9 Go package layout

```text
comparison-service/
├── cmd/server/main.go
├── internal/
│   ├── config/config.go
│   ├── httpapi/
│   │   ├── server.go
│   │   ├── middleware.go
│   │   ├── validate.go
│   │   ├── diff.go
│   │   ├── health.go
│   │   └── errors.go
│   ├── oasdiff/runner.go
│   ├── specs/convert.go
│   ├── pointer/pointer.go
│   ├── normalize/
│   │   ├── normalize.go
│   │   ├── keys.go
│   │   ├── resolve.go
│   │   ├── usedby.go
│   │   ├── titles.go
│   │   └── sort.go
│   └── model/
│       ├── change.go
│       ├── warning.go
│       └── api.go
├── testdata/pairs/...
├── go.mod
├── go.sum
└── Dockerfile
```

---

## 12. Normalization

Normalization turns the nested oasdiff object into a flat, deterministic list of `DetectedChange` values. The rules below are based on live output from the installed engine, not on the v1 guesses.

### 12.1 Observed output shapes

Confirmed on a real pets diff:

- `info.version` is `{ from, to }`; `info.title` is `{ from, to }`.
- `paths.modified[path].operations.added` and `.deleted` are arrays of **uppercase** method names (`"DELETE"`).
- `paths.modified[path].operations.modified` is keyed by uppercase method (`"GET"`).
- Operation fields use engine names: `operationID`, `securityRequirements`.
- Parameter changes:
  - `parameters.added`: `{ "<in>": ["<name>"] }`
  - `parameters.deleted`: `{ "<in>": ["<name>"] }`
  - `parameters.modified`: `{ "<in>": { "<name>": { ... } } }`
- Response changes:
  - `responses.modified["200"].content.modified["application/json"].schema...`
  - `responses.modified["200"].headers.modified["x-rate-limit"]...` (header names are lower-cased)
  - `responses.added` / `responses.deleted` are arrays of status-code strings.
  - `content.added` / `content.deleted` are arrays of media types.
- Schema changes:
  - `required.added` / `required.deleted` are arrays of property names.
  - `properties.added` / `properties.deleted` are arrays of property names.
  - `properties.modified[name]...`
  - `enum.added` / `enum.deleted` are arrays of values.
  - Constraint names are `max`, `min`, `exclusiveMax`, `exclusiveMin`, `maxLength`, `minLength`, `pattern`, `multipleOf`, `default`.
  - A type change can be `type: { "added": ["string"], "deleted": ["integer"] }`.
- Security changes:
  - Top-level `security` and operation `securityRequirements` use `{ added: [{ index, schemes }], deleted: [{ index, schemes }] }`.
- Servers: `servers.added` / `servers.deleted` are arrays of URL strings.
- Components: `components.securitySchemes.added` / `.deleted` are arrays of scheme names.
- Extensions: `info.extensions.modified.<x-key>` (and the equivalent under other objects) is an **array of edit operations**, not `{ from, to }`:
  ```json
  {
    "info": {
      "extensions": {
        "modified": {
          "x-date": [
            { "oldValue": "2024-01-01", "value": "2024-02-02", "op": "replace", "from": "", "path": "" }
          ]
        }
      }
    }
  }
  ```
  Map `extensions.modified.<x-key>` to the parent object’s real key (for example `/info/x-date`), and use `oldValue`/`value` for the change. Do not create a literal `/info/extensions/x-date` pointer.
- `allOf.modified` is an **array of branch diffs**, not a map:
  ```json
  {
    "allOf": {
      "modified": [
        {
          "base": { "index": 0, "component": "PetBase" },
          "revision": { "index": 0, "component": "PetBase" },
          "diff": { "properties": { "added": ["age"] } }
        }
      ]
    }
  }
  ```
  Recurse into each `diff` using the branch index/component to locate the corresponding `allOf` entry. The same array shape is expected for `oneOf` and `anyOf`; confirm with a fixture before shipping.
- Changes can appear both under a component and under every operation that uses it. The operation copy is often an inlined resolved schema, not a `$ref` change.
- `from: null` means the constraint did not exist on that side.
- Header keys and some component names may be lower-cased by the engine; resolution is case-insensitive where the OpenAPI structure allows it.

Any other key must not crash the normalizer. It becomes an unresolved change with a warning.

### 12.2 Leaves

Walk the diff and collect leaves. Each leaf has:

- a section (`paths`, `components`, `info`, `servers`, `security`, `webhooks`, `tags`, `externalDocs`, …),
- a segment list,
- a change type,
- optionally `{ from, to }`.

Rules:

- A node with `from` and `to` is a **modified** leaf.
- A list of strings under `added` or `deleted` gives one **added** or **removed** leaf per string.
- A map under `added` or `deleted` is handled per key, using the same rules.
- `modified` normally holds a map; recurse into each key.
- Exception: `allOf`/`oneOf`/`anyOf` `modified` is an array of `{ base, revision, diff }` items. Recurse into each `diff`, using the branch index/component to locate the array entry.
- Exception: `extensions.modified` is a map of extension key → array of edit operations. Treat each operation as a modified leaf at the parent object’s extension key; use `oldValue`/`value`.
- An `added` + `deleted` pair on the **same scalar key** (for example `type`, `enum` values) is collapsed into one **modified** change when both sides are single values. For `enum`, keep individual added/removed values. For `type`, collapse to `from: deleted[0]`, `to: added[0]`.
- For arrays, resolve additions/removals to the specific array index by value. For objects, resolve to the key.
- Exception: `security` and `securityRequirements` use arrays of `{ index, schemes }` objects. Treat each array item as one leaf (the requirement object); do **not** recurse into `index` and `schemes` as separate changes. The `index` locates `/security/<index>` or `/paths/<p>/<method>/security/<index>`.

### 12.3 Location resolution

Segments are not JSON Pointers. Resolve them against the base or target document, side-aware.

- **Methods:** uppercase diff keys map to lowercase OpenAPI keys: `GET` → `get`, `DELETE` → `delete`.
- **Parameters:** keyed by location and name. Find the entry in `parameters` (or in `components.parameters` through `$ref`) whose `in` and `name` match. Never use an array index.
- **Responses:** status code is the key under `responses`; `default` is allowed.
- **Headers:** match case-insensitively; the engine lower-cases names.
- **Media types:** match the exact key under `content`; escape `/` as `~1`.
- **Schemas:** resolve under `content`, following `$ref` where needed.
- **Security:** use the `index` from the diff object to locate `/security/<index>` or `/paths/<p>/<method>/security/<index>`. The value is the requirement object.
- **Servers:** find the index by URL string.
- **Tags:** added/removed tag strings resolve to the tag array entry; modified tag fields resolve by name.
- **Path-level and operation-level parameters:** match by name and location within the operation first, then the path item.
- **Webhooks:** paths under `webhooks` are treated like paths, but category `webhook`.
- **Callbacks:** resolve nested path expressions as operation locations when possible; otherwise unresolved with a warning.

**Resolution algorithm (critical):**

1. Walk the diff segments from the document root on the selected side.
2. Before consuming the next segment, if the current value is an object with a `$ref` and the segment is not `$ref` itself, resolve the ref and continue from the referenced location. Do not stop at the `$ref` object.
3. Follow refs at every depth. For example, `/paths//pets/get/responses/200/content/application~1json/schema/properties/tag` resolves `schema` → `#/components/schemas/Pets`, then `items` → `#/components/schemas/Pet`, then `properties/tag`.
4. Keep the original operation context for `usedBy`, but attribute the resulting pointer to the deepest component reached through a ref.
5. Detect ref cycles and stop with an unresolved warning.
6. Match header names case-insensitively and response codes as strings.
7. For added list items, resolve to the item index by value; for added map keys, resolve to the key.
8. If any segment cannot be resolved, fall back to the diff value (when present), add a warning, and keep the change.

The result is a JSON Pointer in the document, plus the side it came from.

### 12.4 Engine key mapping

Map engine keys to OpenAPI keys before generating titles and looking up values.

| Engine key | OpenAPI key |
|---|---|
| `max` | `maximum` |
| `min` | `minimum` |
| `exclusiveMax` | `exclusiveMaximum` |
| `exclusiveMin` | `exclusiveMinimum` |
| `operationID` | `operationId` |
| `securityRequirements` | `security` |
| `maxLength` | `maxLength` |
| `minLength` | `minLength` |
| `multipleOf` | `multipleOf` |
| Header names | case-insensitive match to the original header key |

Keep a single mapping table in `normalize/keys.go` and a mirrored display table in the web app. Add new mappings to `docs/notes.md` when found.

### 12.5 Values and presence

For a **modified** leaf:

- `oldValue` is the value at the base pointer; `newValue` is the value at the target pointer.
- A side is absent when the pointer does not resolve on that side, or when the diff’s `from`/`to` is `null` on that side.
- Absent sides set the matching `*ValuePresent` flag to `false` and omit the value.
- If a pointer does not resolve but the diff gives a non-null `from`/`to`, use the diff value, mark the side present, and add a warning.

For **added** leaves: old side absent; new side is the value at the target pointer.

For **removed** leaves: new side absent; old side is the value at the base pointer.

When resolving an added list item, use the item index by value. If the value is not found, use the diff value and warn.

### 12.6 Component attribution and deduplication

1. Resolve each side independently. If a resolved location passes through a `$ref` to `#/components/...`, the change belongs to that component. Rewrite `basePointer`/`targetPointer` to the component location, keeping the subpath inside the component.
2. Base and target may attribute to different components. That is valid.
3. Build the title **after** attribution, using the canonical location.
4. Dedup key:
   - Resolved changes: `changeType | basePointer | targetPointer`.
   - Unresolved changes: `changeType | displayPointer | rawSection | segmentsHash`.
5. If a duplicate key exists, keep the first and discard the rest. Operation-level copies of component changes now share pointers and are discarded.
6. If two changes share a key but have materially different titles/values, keep both and add a warning `DEDUP_COLLISION`. Never merge based only on equal values.
7. Changes not under a component are never deduplicated against each other just because their values match.

This rule is verified by the `shared-schema` fixture. If the fixture shows a different pattern, record it in `docs/notes.md` and adjust the key, but keep the “equal values alone never merge” rule.

### 12.7 `usedBy` (transitive)

For a component change, `usedBy` lists every operation that reaches the component, directly or through other components.

Algorithm:

1. Build a graph where each component points to the components its `$ref`s name.
2. For each operation in the selected document (target for added/modified, base for removed), collect every `$ref` reachable from:
   - path-level parameters,
   - operation parameters (including `$ref` to `components.parameters`),
   - request body (including `$ref` to `components.requestBodies`),
   - responses (including `$ref` to `components.responses`),
   - headers (including `$ref` to `components.headers`),
   - content schemas,
   - `allOf`, `oneOf`, `anyOf`, `not`, `items`, `additionalProperties`, `properties`, `patternProperties`,
   - `discriminator.mapping` values that are refs.
3. Follow component-to-component refs transitively.
4. Detect cycles; each component is visited once per operation.
5. Include the operation if the changed component is in its reachable set.
6. Sort by path, then method.
7. Deduplicate.
8. Cap at 1000 operations; add a warning if capped.

Do not traverse callbacks or links for `usedBy` in v1 of this feature; document the limitation.

Non-component changes have `usedBy: []`.

### 12.8 Titles and descriptions

Generate titles after attribution. Values longer than 60 characters are truncated in titles/descriptions with an ellipsis. Full values stay in `oldValue`/`newValue`.

| Situation | Title | Description |
|---|---|---|
| Endpoint added | `Endpoint added` | `<path> was added.` |
| Endpoint removed | `Endpoint removed` | `<path> was removed.` |
| Operation added | `<METHOD> added` | `<METHOD> <path> was added.` |
| Operation removed | `<METHOD> removed` | `<METHOD> <path> was removed.` |
| Operation modified | `<METHOD> changed` | `<METHOD> <path> was updated.` |
| Parameter added | `Parameter "<name>" added` | `<METHOD> <path> gained the "<name>" <in> parameter.` |
| Parameter removed | `Parameter "<name>" removed` | `<METHOD> <path> lost the "<name>" <in> parameter.` |
| Parameter modified | `Parameter "<name>" changed` | `The "<name>" parameter changed: <field> (<old> → <new>).` |
| Request body added | `Request body added` | `<METHOD> <path> gained a request body.` |
| Request body removed | `Request body removed` | `<METHOD> <path> lost its request body.` |
| Request body modified | `Request body changed` | `<METHOD> <path> request body changed: <field>.` |
| Response added | `Response <code> added` | `<METHOD> <path> gained response <code>.` |
| Response removed | `Response <code> removed` | `<METHOD> <path> lost response <code>.` |
| Response modified | `Response <code> changed` | `<METHOD> <path> response <code> changed: <field>.` |
| Property added | `Property "<name>" added` | `<Component> gained the "<name>" property.` |
| Property removed | `Property "<name>" removed` | `<Component> lost the "<name>" property.` |
| Property modified | `Property "<name>" changed` | `<Component>.<name> changed: <field>.` |
| Schema constraint changed | `<Component> changed: <field>` | `<Component> <field> changed (<old> → <new>).` |
| Required added | `"<name>" is now required` | `<Component> requires "<name>".` |
| Required removed | `"<name>" is no longer required` | `<Component> no longer requires "<name>".` |
| Enum value added | `Value "<v>" added to <name>` | `<Component>.<name> accepts "<v>".` |
| Enum value removed | `Value "<v>" removed from <name>` | `<Component>.<name> no longer accepts "<v>".` |
| Description changed | `Description changed` | `<location> description was updated.` |
| Summary changed | `Summary changed` | `<location> summary was updated.` |
| Security added | `Security requirement added` | `<location> gained a security requirement.` |
| Security removed | `Security requirement removed` | `<location> lost a security requirement.` |
| Security scheme added | `Security scheme "<name>" added` | `Security scheme "<name>" was added.` |
| Security scheme removed | `Security scheme "<name>" removed` | `Security scheme "<name>" was removed.` |
| Server added | `Server added` | `Server <url> was added.` |
| Server removed | `Server removed` | `Server <url> was removed.` |
| Webhook added | `Webhook added` | `<path> webhook was added.` |
| Webhook removed | `Webhook removed` | `<path> webhook was removed.` |
| Metadata changed | `<field> changed` | `<location> <field> was updated.` |
| Unresolved | `Change in <section>` | `A <changeType> change in <section> could not be located.` |
| Generic fallback | `<value> added/removed/changed` | `<pointer> changed.` |

`<field>` is the mapped OpenAPI field name (`maximum`, `type`, `format`, …). `<Component>` is the component name. `<location>` is a human-readable path/method/component label.

Escaping: titles/descriptions are plain text; the React UI escapes them. Do not build HTML strings.

### 12.9 Unresolved changes and warnings

- A leaf that cannot be resolved is **kept** with:
  - `category: "other"`,
  - `displayPointer` built from the raw section and segments,
  - `oldValuePresent`/`newValuePresent` from its `from`/`to`,
  - the available value(s).
- Each such leaf adds a warning:

```ts
{
  code: "UNRESOLVED_CHANGE",
  message: "Could not locate <changeType> change in <section>.",
  rawSection: string,
  segments: string[],
  side?: "base" | "target" | "both"
}
```

- Unknown top-level sections are handled the same way.
- Warnings are stored on the comparison and shown in the header as “N items could not be located.”
- No change is dropped. Warnings may be capped at `MAX_WARNINGS`; set `warningsTruncated: true` and add a summary warning.

### 12.10 Category mapping

The first matching rule wins.

| Location | Category |
|---|---|
| `/paths/<p>` only | `endpoint` |
| `/paths/<p>/<method>` with only method-level fields (`summary`, `description`, `operationId`, `tags`, `deprecated`) | `operation` |
| `/paths/<p>/<method>/parameters`, `/components/parameters` | `parameter` |
| `/paths/<p>/<method>/requestBody`, `/components/requestBodies` | `request` |
| `/paths/<p>/<method>/responses`, `/components/responses`, `/components/headers`, `/components/links` | `response` |
| `/components/schemas` | `schema` |
| `/components/securitySchemes`, `/security`, `/paths/<p>/<method>/security` | `security` |
| `/servers` | `server` |
| `/info`, `/tags`, `/externalDocs`, `/components/examples`, `/jsonSchemaDialect` | `metadata` |
| `/webhooks` | `webhook` |
| `/components/callbacks` | `operation` |
| `/components/pathItems` | `endpoint` |
| anything else | `other` |

`<method>` is one of `get`, `put`, `post`, `delete`, `options`, `head`, `patch`, `trace`.

A change inside a component is categorized by its component location, not by the operation that referenced it.

### 12.11 Flags and grouping

- `isDocumentation` is true when the last segment of the location is `description`, `summary`, `example`, `examples`, or `externalDocs`.
- `groupKey` is `category|method|path|component`, with `-` for missing parts. Method is uppercase.
  - Examples: `parameter|GET|/pets|-`, `schema|-|-|Pet`, `endpoint|-|/pets|-`.
  - Use the component name only (`Pet`). If two component types share a name, use `<type>/<name>` to keep groups distinct.
- `path` and `method` are set for operation-scoped changes. Component-attributed changes have `path: null` and `method: null`.
- For endpoint changes, `path` is set and `method` is null.

### 12.12 Ordering, IDs, and determinism

Sort by:

1. Category order: `endpoint`, `operation`, `parameter`, `request`, `response`, `schema`, `security`, `server`, `metadata`, `webhook`, `other`.
2. `displayPointer` (byte-wise).
3. Change type order: `added`, `removed`, `modified`.
4. Method (nulls first, then alphabetical).
5. Path (nulls first, then alphabetical).
6. Title (byte-wise).
7. `rawSection` and joined `segments` as the final deterministic tie-breaker.

`id` is `"c" + zero-based index after sorting`. `position` in the database is the same index.

The sort must be stable and reproducible across runs and machines. Add a golden test that runs the same fixture twice and compares bytes.

### 12.13 Limits

- Abort at `MAX_CHANGES + 1` with `TOO_MANY_CHANGES`.
- Accumulate the serialized size of normalized changes; abort above `MAX_NORMALIZED_BYTES` with `OUTPUT_TOO_LARGE`. This prevents duplicated values from exhausting the web and database.
- Cap warnings at `MAX_WARNINGS`.
- `usedBy` capped at 1000.
- Traversal depth and visited-node counts are bounded to prevent pathological graphs.
- Every abort path cleans up the temp directory.

---

## 13. Change contract

This contract is the value stored in `DetectedChange.data`.

### 13.1 Go

`comparison-service/internal/model/change.go`:

```go
package model

import "encoding/json"

type DetectedChange struct {
    ID              string          `json:"id"`
    Category        string          `json:"category"`
    ChangeType      string          `json:"changeType"`
    Title           string          `json:"title"`
    Description     string          `json:"description"`
    Method          *string         `json:"method"`
    Path            *string         `json:"path"`
    BasePointer     *string         `json:"basePointer"`
    TargetPointer   *string         `json:"targetPointer"`
    DisplayPointer  string          `json:"displayPointer"`
    OldValue        json.RawMessage `json:"oldValue,omitempty"`
    NewValue        json.RawMessage `json:"newValue,omitempty"`
    OldValuePresent bool            `json:"oldValuePresent"`
    NewValuePresent bool            `json:"newValuePresent"`
    IsDocumentation bool            `json:"isDocumentation"`
    UsedBy          []UsedBy        `json:"usedBy"`
    GroupKey        string          `json:"groupKey"`
    RawSection      string          `json:"rawSection"`
}

type UsedBy struct {
    Method string `json:"method"`
    Path   string `json:"path"`
}

type NormalizationWarning struct {
    Code       string   `json:"code"`
    Message    string   `json:"message"`
    RawSection string   `json:"rawSection"`
    Segments   []string `json:"segments"`
    Side       string   `json:"side,omitempty"`
}
```

Presence rules:

- Absent: `OldValue` is `nil`, the field is omitted, and `OldValuePresent` is `false`.
- Present `null`: set `OldValue = json.RawMessage("null")`. It is non-empty, so `omitempty` keeps it, and it marshals as `null`.
- Present value: set the raw JSON and the flag.

Initialize `UsedBy` to an empty slice, not `nil`, so it marshals as `[]`.

### 13.2 TypeScript

`web/src/types/changes.ts`:

```ts
import { z } from "zod";

export const changeTypeSchema = z.enum(["added", "removed", "modified"]);

export const changeCategorySchema = z.enum([
  "endpoint",
  "operation",
  "parameter",
  "request",
  "response",
  "schema",
  "security",
  "server",
  "metadata",
  "webhook",
  "other",
]);

export const usedBySchema = z.object({
  method: z.string(),
  path: z.string(),
});

export const normalizationWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  rawSection: z.string(),
  segments: z.array(z.string()),
  side: z.enum(["base", "target", "both"]).optional(),
});

export const detectedChangeSchema = z
  .object({
    id: z.string(),
    category: changeCategorySchema,
    changeType: changeTypeSchema,
    title: z.string(),
    description: z.string(),
    method: z.string().nullable(),
    path: z.string().nullable(),
    basePointer: z.string().nullable(),
    targetPointer: z.string().nullable(),
    displayPointer: z.string(),
    oldValue: z.unknown().optional(),
    newValue: z.unknown().optional(),
    oldValuePresent: z.boolean(),
    newValuePresent: z.boolean(),
    isDocumentation: z.boolean(),
    usedBy: z.array(usedBySchema),
    groupKey: z.string(),
    rawSection: z.string(),
  })
  .passthrough();

export type DetectedChange = z.infer<typeof detectedChangeSchema>;

export const diffResponseSchema = z.object({
  engineVersion: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  base: z.object({
    title: z.string(),
    version: z.string(),
    openapi: z.string(),
  }),
  target: z.object({
    title: z.string(),
    version: z.string(),
    openapi: z.string(),
  }),
  rawDiffText: z.string(),
  changes: z.array(detectedChangeSchema),
  warnings: z.array(normalizationWarningSchema),
  warningsTruncated: z.boolean().optional().default(false),
});

export type DiffResponse = z.infer<typeof diffResponseSchema>;
```

Rules:

- `method` is uppercase or `null`.
- `displayPointer` is `targetPointer` when present, otherwise `basePointer`.
- No field for severity, compatibility, or classification may be added.
- Unknown fields pass through `passthrough()` and are stored in `data`.
- `rawDiffText` must parse to a plain object (not an array, not `null`). The web validates this before storing it.

### 13.3 Forbidden fields test

Add a test that recursively scans:

- the Go `DetectedChange` JSON,
- the comparison API response,
- the export JSON,

and fails if a key named `breaking`, `severity`, `compatibility`, `compatible`, or `isBreaking` appears. `warnings` is allowed only for normalization warnings and must not contain engine severity levels.

---

## 14. Counts and breakdowns

Counts are computed from the stored change list in `web/src/lib/counts.ts` and written to `Comparison` in the same transaction.

### 14.1 Totals

- `totalAdded`: `changeType === "added"`.
- `totalRemoved`: `changeType === "removed"`.
- `totalModified`: `changeType === "modified"`.
- `totalChanges`: all changes; always equals the sum of the three.
- Documentation changes are included in every total. The filter only hides them in the list.

### 14.2 Breakdowns (computed on demand from stored rows)

- By category, with a count per change type.
- By endpoint: changes grouped by `(method, path)`; component changes are excluded.
- By component: derive the component name from `displayPointer` or `basePointer` using `/components/<type>/<name>`; group by that name.
- Documentation: `documentationChanges` and `structuralChanges = totalChanges - documentationChanges`.
- Warnings: `warnings.length`, plus `warningsTruncated`.
- Failed comparisons: all counts are zero.

### 14.3 Display rules

- Header badges show total, added, removed, modified.
- If documentation changes are hidden by the default filter, show a small hint: “N documentation changes hidden by the current filter.”
- The Counts tab always shows the full dataset, not the filtered dataset.
- Simple horizontal bars are enough; no chart library.
- Counts never come from oasdiff’s `summary` command.

---

## 15. Source diff

Computed in Next.js without calling the comparison service.

### 15.1 Algorithm

1. Parse each version’s stored `content` using `specFormat`, stripping a leading UTF-8 BOM before parsing (the stored text keeps its BOM).
2. Validate that the parsed value is JSON-serializable:
   - no cycles,
   - no `BigInt`,
   - no `NaN`/`Infinity`,
   - no functions/undefined,
   - dates converted to ISO strings only if they exist (prefer rejecting them at upload).
3. Serialize with a recursive, key-sorting stringifier equivalent to `JSON.stringify(value, replacer, 2)` and add a trailing newline. Arrays preserve order.
4. Compare the two canonical strings with `diffLines` from `diff`.
5. Render in split view by default, with a unified toggle, line numbers, and collapsed unchanged context.

Line numbers refer to the canonical text, not the uploaded file. A note above the diff must say so.

### 15.2 Canonicalization rules

- Object keys sorted lexicographically by UTF-16 code units (or a documented byte order used consistently).
- Arrays keep order.
- Strings/numbers/booleans/null are JSON literals.
- `undefined` keys are omitted.
- Reject non-finite numbers at upload rather than silently converting them to `null`.
- YAML timestamps remain strings (section 11.3).
- YAML anchors/aliases are expanded into normal JSON.
- Duplicate keys are rejected at upload.
- `$ref` is not resolved for the source diff; the canonical text shows the document as written.

### 15.3 Limits and caching

- If either canonical text exceeds 8 MiB, do not render the diff; show “Source diff is too large” with links to the raw viewers.
- Compute the canonical texts and diff on the server. Pass the two canonical strings and a compact diff result to the client viewer.
- Cache per request with `React.cache()` keyed by `(baseChecksum, targetChecksum)`. Do not cache across users.
- If a stored version fails to parse, show an error panel. This should not happen after upload; log it server-side.

### 15.4 Viewer

- Primary: `react-diff-viewer-continued`, split view default, unified toggle, line numbers, collapsed context.
- Verify React 19 compatibility in Phase 0.
- Fallback: a custom renderer using `diffLines`, rendering `<table>` or semantic rows with added/removed classes, keyboard scrolling, and line numbers. Do not block the whole feature on a third-party compatibility issue.
- Font: monospace, horizontal scroll on small screens.
- Copy/download canonical text is optional.

---

## 16. Interface

Tailwind CSS and shadcn/ui, default theme, light/dark modes. `sonner` for toasts. `shiki` for syntax highlighting.

Pages are Server Components that read PostgreSQL directly. Interactive parts are Client Components that call the JSON API and then refresh the route with `router.refresh()`.

### 16.1 Routes

| Route | Content |
|---|---|
| `/` | Redirect to `/dashboard` if signed in, else `/login` |
| `/register`, `/login` | Centered auth forms. Success redirects to `/dashboard` or a safe `next` path. |
| `/dashboard` | Three stat cards (projects, versions, comparisons), project table, latest 10 comparisons across projects, “New project” |
| `/projects/[projectId]` | Header, versions table, comparisons table, upload, compare, edit, delete |
| `/versions/[versionId]` | Metadata card, raw viewer, comparisons involving this version |
| `/comparisons/[comparisonId]` | Comparison workspace |

Top bar on every `(app)` page: “Diffora” + “API Specification Comparison Tool”, dashboard link, user name, theme toggle, log out.

### 16.2 Data loading

- `/dashboard`: Server Component queries `Project`, `ApiVersion`, and `Comparison` with the user filter.
- `/projects/[id]`: Server Component loads project, versions, and comparisons directly from Prisma.
- `/versions/[id]`: Server Component loads version metadata, content, and comparisons where `baseVersionId = id OR targetVersionId = id`.
- `/comparisons/[id]`: Server Component loads the comparison, all changes from Prisma, and the project’s version list (for the “Run again” dialog). The client workspace receives them as props. The `/changes` API remains for export/refetch and tests. If the serialized changes payload would exceed 20 MiB, fall back to the `/changes` API with a loading state.
- Mutations use the JSON API, then `router.refresh()`.
- Never fetch page data from a Client Component on first load.

### 16.3 Dashboard

- Stat cards: total projects, total versions, total comparisons for the signed-in user.
- Project table: name, version count, comparison count, updated date; row links to the project.
- Latest 10 comparisons: project name, base → target, counts, status, created date; row links to the comparison.
- Empty state: “No projects yet” with a “Create your first project” CTA.
- “New project” dialog: name and optional description.

### 16.4 Project page

- Header: name, description, created/updated date.
- Actions: Edit, Upload version, Compare, Delete.
- Versions table: label, OpenAPI version, format, size, upload date. Rows link to the version.
- Comparisons table: base → target, counts, date, status, actions (Open, Delete). Failed rows show a red badge with the error on hover and a link to the failed comparison.
- Upload dialog:
  - file input accepting `.yaml`, `.yml`, `.json`;
  - label;
  - optional description;
  - client-side size check;
  - inline server errors;
  - disabled while uploading.
- Compare dialog:
  - two selects of versions in this project;
  - each excludes the version chosen on the other side;
  - submit disabled until both are chosen;
  - disabled entirely when fewer than two versions exist;
  - loading state while the comparison runs;
  - on success, navigate to the comparison;
  - on failure with `details.comparisonId`, navigate to the failed comparison;
  - otherwise, show a toast and inline error.
- Edit dialog: name and description.
- Delete confirmation: requires explicit confirmation; explains that versions and comparisons will be deleted.
- Delete comparison confirmation.

### 16.5 Version page

- Metadata card: label, title, OpenAPI version, format, size, checksum (short), uploaded date, description.
- Raw viewer: monospace, line numbers optional, copy button, link to `/api/versions/:id/raw`.
- “Comparisons involving this version” table: base → target, counts, status, date.
- Back link to the project.
- No edit/delete actions.

### 16.6 Comparison workspace

**Header (sticky)**

- Base label → target label, with both titles.
- Badges for total, added, removed, modified.
- Created date, engine version, duration.
- “Unlocated items” badge when `warnings` is not empty; clicking shows the warning list. Do not label it “warning” or “severity” in the UI.
- “Export JSON” button.
- Failed state: error message, failed badge, “Run again” button.
- Delete comparison action (with confirmation).

**Tabs:** Changes (default), Source diff, Counts.

**Changes tab**

Left panel, 360 px wide on desktop; a sheet/drawer below `lg`:

- Search box: title, displayPointer, path, method, description; case-insensitive; 150 ms debounce.
- Filters: change type (All, Added, Removed, Modified), categories, “Show documentation changes” switch (off by default).
- Tree:
  - Endpoints: grouped by path, then method. Endpoint-level changes sit directly under the path.
  - Components: grouped by component name.
  - Security, Servers, Metadata, Webhooks, Other: one group per category.
- Group headers show a filtered count. Groups collapse. All start expanded.
- Selected change is highlighted and scrolled into view.

Right panel:

- Title, category badge, change-type badge, documentation badge when applicable.
- Method and path when present.
- `displayPointer` in monospace with a copy button.
- Before and After code panels for modified changes; only After for added; only Before for removed.
- An absent side shows “Not present in this version,” never `null`.
- Present `null` shows `null` in a code panel.
- “Used by” list when `usedBy` is not empty. Each item selects its endpoint in the tree; if filters hide it, clear the filters first.
- Copy as JSON.
- Large values: pretty-print JSON; truncate display above 100 KB with a “Show full value” control.
- Syntax highlighting: shiki with `json`; use plain monospace for strings/numbers if highlighting fails.

**Source diff tab:** section 15.

**Counts tab:** section 14, as tables and simple bars.

**States**

- No changes: “These two versions are identical.”
- No results for a filter: “No changes match these filters,” with a Clear button.
- Failed comparison: the sanitized error message, zero-change state, and “Run again” that opens the compare dialog with both versions selected.
- Loading: skeleton in the left panel and detail area.
- 404: not-found page.
- 502/504: toast with retry guidance.

**URL state**

Tab, selected change, search, change type, categories, and documentation toggle are query parameters.

Example: `?tab=changes&change=c12&type=modified&categories=schema,parameter&q=/pets&docs=1`

Rules:

- Defaults are omitted: `tab=changes`, `type=all`, `docs=0`, empty `q`, no `categories`.
- Categories are comma-separated and validated against the enum.
- Invalid values fall back to defaults without crashing.
- Changing filters uses `router.replace(..., { scroll: false })`.
- Reloading restores the view.
- If the selected change no longer matches the filters, keep it selected but show a small “hidden by filters” notice, or clear it consistently. Pick one and test it.
- Back/forward navigation works.

### 16.7 Dates and numbers

- Format dates with `Intl.DateTimeFormat` using a fixed `timeZone: "UTC"` and label them “UTC” to avoid hydration mismatches. Alternatively, use a client-only `<time>` component that formats in the user’s timezone. Pick one and document it.
- Format bytes with a small helper (`KB`, `MB`).
- Durations: `< 1000 ms` as `N ms`, otherwise `N.N s`.

### 16.8 Accessibility and responsiveness

- All dialogs have titles, descriptions, focus traps, Escape-to-close, and trigger-focus restoration.
- Tabs use `role="tablist"` with arrow-key navigation.
- Tree groups are buttons with `aria-expanded`.
- Change list items are buttons/links with accessible names.
- Focus is visible on all interactive elements.
- The diff is readable at 200% zoom and on mobile via horizontal scrolling.
- No color-only meaning: badges include text.
- Empty and error states are announced politely where appropriate.

### 16.9 Toasts

- Success: project created/updated/deleted, version uploaded, comparison deleted, copied.
- Error: use the friendly message from the API, not the raw code, with the code available in details if useful.
- Never show a toast for every keystroke or filter change.

---

## 17. Security

| Area | Requirement |
|---|---|
| Passwords | bcryptjs cost 12; 8–72 bytes; never returned or logged. |
| Session | JWT in HttpOnly cookie; `Secure` controlled by `COOKIE_SECURE`; `SameSite=Lax`; 7-day expiry. |
| Proxy | `proxy.ts` verifies signature/expiry only; no Prisma; page layout re-checks. |
| CSRF | JSON-only mutations (except multipart), `SameSite=Lax`, Origin/Sec-Fetch-Site checks. |
| Ownership | Every project/version/comparison query filters by the owning user; mismatch → 404. |
| Uploads | Content-Length guard, size limit, extension check, fatal UTF-8, parse checks, OpenAPI version check, engine validation. |
| Raw viewer | `text/plain`, `nosniff`, `Content-Security-Policy: sandbox`, sanitized filename, no-store. |
| Comparison service | Shared secret on every request except `/health`; constant-time compare; no published port in Compose. |
| Process execution | Fixed arguments, no shell, temp dir, non-root, timeouts, output caps, process-group kill. |
| External refs | `--allow-external-refs=false` and a pre-scan rejecting non-fragment `$ref`/absolute `$id`. |
| YAML bombs | Alias, depth, and node limits; reject unsupported tags. |
| Temporary files | `os.MkdirTemp`, mode 0700, files 0600, `defer os.RemoveAll`. |
| Timeouts | Validate 20 s, diff 60 s, web→Go 90 s, DB health 2 s. |
| Logging | No spec content, cookies, secrets, emails, or full file paths. Log request id, route, status, duration, sizes, codes. |
| Error messages | No stack traces, paths, keys, secrets, engine severities, or spec snippets. |
| Headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP`. |
| CSP | Optional; if added, verify Next inline scripts and shiki in dev and production. Do not ship a broken CSP. |
| Rate limits | Best-effort login/register limits; document the limitation. |
| Dependencies | Pin versions; run `npm audit` and `go vet` as part of Phase 6. |
| Secrets | `.env` files are gitignored; examples contain placeholders only. Validate at startup. |
| Export | `Content-Disposition: attachment`, `application/json`, no-store. |
| `server-only` | Auth, DB, env, and comparison client modules import `server-only`. |

Threat notes:

- The comparison service is on an internal Compose network and has no published port. Do not change that without adding auth and TLS.
- The web app is the only client of the comparison service. Do not expose the shared secret to the browser.
- A malicious spec can still consume CPU/memory within the limits. The caps are the primary mitigation.
- Do not add public comparison links; there is no access table.

---

## 18. Testing

> **v3 note:** the implemented Go tests are the source of truth. Normalizer/golden-normalized tests are superseded. Keep fixture validation, engine runner tests, HTTP contract tests, YAML/JSON passthrough tests, and the Playwright flow.

### 18.1 Test database

- `docker-compose.test.yml` runs PostgreSQL 16 on `localhost:5433`.
- `TEST_DATABASE_URL` and `TEST_DIRECT_URL` point at it.
- Run `prisma migrate deploy` before tests.
- Truncate tables between integration tests (respecting foreign keys) or use a per-run schema/database.
- Playwright uses the test database, never Supabase.
- Go tests do not need a database.

### 18.2 Go unit tests

- `specs`: YAML 1.2 conversion, unquoted `200`, `yes`/`no`/`on`/`off` as strings, dates as strings, anchors/aliases, merge keys, duplicate keys, multi-document rejection, invalid tags, oversized/deep input.
- `pointer`: `Escape`, `Join`, `Get` on found/missing paths, `$ref` cycle detection, percent-decoding.
- `oasdiff`: success, non-zero exit, exit 102, timeout (fake script that sleeps), stdout cap, stderr cap.
- `normalize`: one test per rule in sections 12.2–12.13, including:
  - key mapping (`max` → `maximum`),
  - uppercase methods,
  - lower-cased header names,
  - type added/deleted collapse,
  - security requirements,
  - servers,
  - operation copies vs component copies,
  - dedup collisions,
  - `usedBy` direct/transitive/allOf/items/additionalProperties/cycles,
  - unresolved changes and warnings,
  - deterministic ordering and IDs,
  - change limit.
- `httpapi`: missing/wrong secret, malformed JSON, wrong content type, oversized body, panic recovery, request id echo.

### 18.3 Fixture pairs

Each pair lives in `comparison-service/testdata/pairs/<name>/` with:

- `base.yaml`
- `target.yaml`
- `raw.expected.json` — exact engine output, generated in Phase 0
- `expected.json` — normalized changes + warnings

Every fixture except `invalid-target` must pass `oasdiff validate`.

| Pair | Change under test | Expected |
|---|---|---|
| `identical` | same file twice | no changes |
| `endpoint-added` | new path | one `endpoint` added |
| `endpoint-removed` | path deleted | one `endpoint` removed |
| `operation-removed` | method deleted | one `operation` removed, method set |
| `operation-metadata` | `operationID`, `deprecated`, tags changed | operation changes, not `other` |
| `query-param-added` | optional query parameter | one `parameter` added |
| `param-max-added` | `maximum` added | one `parameter` modified, old side absent |
| `param-min-changed` | `minimum` changed | one `parameter` modified, both values |
| `param-reordered` | two parameters swapped | no changes |
| `property-added` | schema property added | one `schema` added under the component |
| `property-removed` | schema property removed | one `schema` removed |
| `required-added` | property becomes required | one `schema` modified |
| `enum-value-added` | enum value added | one `schema` modified |
| `type-changed` | `type` integer → string | one `schema` modified, both values |
| `response-schema-changed` | response `$ref` changed | one `response` or `schema` change with correct side attribution |
| `response-added` | new status code | one `response` added |
| `response-header-changed` | header type changed | one `response` modified, case-insensitive header |
| `request-body-required` | `required` flipped | one `request` modified |
| `shared-schema` | schema used by two operations | one `schema` change, `usedBy` lists both |
| `transitive-usage` | endpoint reaches schema through another schema | `usedBy` includes the endpoint |
| `allof-usage` | schema reached through `allOf` | `usedBy` includes the endpoint |
| `description-only` | description edited | one change with `isDocumentation` true |
| `operation-description` | operation summary changed | one `operation` modified, not `other` |
| `security-changed` | security scheme requirement changed | one `security` change |
| `server-changed` | server URL changed | one `server` change |
| `webhook-added` | 3.1 webhook added | one `webhook` change |
| `yaml-quirks` | unquoted `200`, `on`/`yes`, dates | parses and diffs correctly |
| `yaml-anchors` | anchors/aliases/merge | parses identically |
| `openapi-31` | both 3.1.0, property added | one `schema` added |
| `external-ref` | `$ref` outside the document | 422 `EXTERNAL_REF_NOT_SUPPORTED` |
| `too-many-changes` | generated large diff | 422 `TOO_MANY_CHANGES` |
| `invalid-target` | target is not valid YAML | 422 `INVALID_SPEC` |

Add fixtures as real output reveals new shapes. Record every new fixture in `docs/notes.md`.

### 18.4 YAML parity test

- A Go test parses each fixture and writes canonical JSON to stdout.
- A Node script parses the same fixture with the web parser and writes canonical JSON.
- A comparison script fails if the two outputs differ.
- Run it for all `yaml-*` fixtures and the seed specs.
- Record known, accepted differences in `docs/notes.md`. The goal is zero differences for the supported subset.

### 18.5 Contract test

- A Vitest test reads every `expected.json` from the Go fixtures.
- It validates each change with `detectedChangeSchema`.
- It compares the normalized output to the fixture.
- It checks that no forbidden severity/compatibility keys exist.
- This keeps the Go and TypeScript contracts aligned without duplicating schemas by hand.

### 18.6 Next.js unit and integration tests (Vitest)

- Configure Vitest with a Node environment for route handlers and a `jsdom` environment for component tests. Mock `next/headers` cookies, `server-only`, and the comparison client where needed.
- Register rejects duplicate emails, including case variants.
- Login returns the same error for unknown email and wrong password.
- A user cannot read or change another user’s project, version, or comparison (404).
- Upload rejects: missing file, too large, unsupported extension, invalid UTF-8, invalid YAML, multi-document YAML, non-3.x OpenAPI, duplicate label (case-insensitive), external ref.
- Upload accepts YAML and JSON, 3.0 and 3.1, BOM, CRLF.
- Comparison rejects: same version twice, version from another project, missing version.
- `toChangeRow` copies indexed fields and stores the full object in `data`.
- A change with an unknown field round-trips through `data` unchanged.
- Present `null` vs absent values round-trip through Prisma JSON correctly.
- Counts match stored rows; docs included; structural count defined.
- `canonical-spec.ts` produces identical output for a YAML file and its JSON equivalent.
- `canonical-spec.ts` rejects cycles/NaN.
- **Reopen test:** import the comparison and changes GET handlers with a mocked comparison client that throws on any call. The tests must pass.
- Failed comparison returns zero changes and exports `rawDiff: null`.
- Deleting a project removes its versions and comparisons.
- Deleting a comparison removes its changes.
- Forbidden severity/compatibility fields are absent from API responses.
- Error responses never include a stack, path, or secret.

### 18.7 Playwright end-to-end

Run against the test database and a locally built Go service.

1. Register and create a project.
2. Upload the `identical` base as `v1` and target as `v2`.
3. Compare `v1` → `v2`. Expect the identical state.
4. Upload the `endpoint-removed` target as `v3`. Compare `v1` → `v3`. Expect one endpoint removed in the tree.
5. Select the change. Expect a Before panel and “Not present in this version” on the After side.
6. Open the Source diff tab. Expect removed lines highlighted.
7. Change filters/search/selection. Reload the URL. Expect the same tab, selection, filters, and search.
8. Export. Expect a JSON file with `exportVersion`, `comparison`, `changes`, and `rawDiff`.
9. Reopen the comparison from the project page. Expect it to render without a call to the comparison service.
10. Stop the Go service container. Reload the saved comparison. Expect it to still render. Restart the service.
11. Create a comparison with the Go service stopped. Expect a failed comparison with an error and a working “Run again” after restart.
12. Delete the comparison; expect it to disappear from the project page.

Use unique emails per run and clean up via the test database.

### 18.8 Performance smoke

- 2 MiB spec, ~500 changes: comparison creation under 10 s on the demo machine.
- Reopening the comparison under 2 s.
- Source diff for 2 MiB specs under 3 s or the size guard triggers.
- Changes API response size is reasonable for 5000 small changes; if it exceeds 20 MiB, revisit the cap or add compression.

### 18.9 What must never be cut

- Normalizer golden tests.
- Ownership checks.
- `toChangeRow` tests.
- Reopen test.
- Day 0 engine gate.
- Upload validation.
- External-ref protection.
- Failed-comparison id path.

---

## 19. Build plan (v2)

> **v3 status:** Phase 0 and Phase 1 are complete. The thin Go service is implemented and tested. Phase 2 (database, auth, app shell) is next. Ignore the normalizer tasks in the old Phase 1 list; they are not part of v3.

The v1 estimate of 12 focused hours is not credible for this scope. The plan below is realistic for a demo-grade end-to-end build. It is ordered so each phase produces something testable and unblocks the next.

### Phase 0 — Baseline, framework audit, engine gate (0.5–1 day)

1. Repository hygiene (section 3.3): git, rename, move scratch, docs templates.
2. Framework audit:
   - read the Next 16 docs for `proxy.ts`, async `params`, route handlers, standalone output;
   - move `web` to `src/`;
   - apply section 4.3 config;
   - install the dependency set;
   - verify shadcn/Tailwind 4 and `react-diff-viewer-continued` with React 19.
3. Engine gate (section 5.5):
   - install and pin the exact oasdiff release;
   - record the version/checksum;
   - validate and diff the seed specs;
   - create `raw.expected.json` for every fixture;
   - update section 12 and `docs/notes.md` with real shapes.
4. YAML parity decision: confirm the Go converter and web parser rules.

**Done when:** `docs/notes.md` contains the pinned version, checksums, real key mappings, and fixture validation results; every fixture except `invalid-target` validates; the web scaffold builds with the target config.

### Phase 1 — Go comparison service (2 days)

1. Skeleton, config, `/health`, shared-secret middleware, request IDs, panic recovery, timeouts.
2. `specs` converter with YAML 1.2 rules and limits; tests.
3. `pointer` package with `$ref` resolution, escaping, cycle detection; tests.
4. `oasdiff` runner with context, temp dirs, output caps, process-group kill; tests.
5. `POST /validate` with JSON findings and sanitized messages.
6. `POST /diff` returning raw + normalized changes, warnings, and caps.
7. Normalizer:
   - leaves, key mapping, side-aware resolution;
   - component attribution, dedup, `usedBy`;
   - categories, titles, ordering, IDs;
   - unresolved changes and warnings.
8. Golden tests for every fixture.
9. Dockerfile with pinned oasdiff and checksum.

**Done when:** `go test ./...` passes; every fixture golden test passes; `/diff` response validates against `diffResponseSchema`; timeout/cap/limit tests pass; the service runs non-root in Docker.

### Phase 2 — Web foundation and auth (1.5 days)

1. Prisma schema, migration, DB singleton, env validation.
2. Auth library: bcrypt, JWT, cookie, `getCurrentUser`, `requireUser`.
3. `proxy.ts`, page auth, root/auth redirects.
4. Auth routes and pages with inline errors and toasts.
5. App shell: top bar, theme toggle, toaster, error/not-found pages.
6. Error codes, API helpers, request IDs, no-store headers.
7. Tests: register/login/duplicate/case, ownership helpers, cookie attributes, proxy redirects.

**Done when:** register → dashboard → logout → login works over HTTP in Docker-like conditions; a protected page redirects; a second user gets 404 on another user’s project; tests pass.

### Phase 3 — Projects and versions (1.5 days)

1. Project CRUD routes with ownership.
2. Dashboard and project page with server queries.
3. Upload pipeline with all validation steps.
4. Version page, raw viewer, copy/download.
5. Project/version dialogs, delete confirmation, empty states.
6. Tests for every upload rejection path and the cascade delete.

**Done when:** a user can create/edit/delete a project; upload YAML and JSON 3.0/3.1; invalid files show clear errors; raw viewer is safe; another user cannot see any of it.

### Phase 4 — Comparisons and storage (2 days)

1. Comparison client with timeout, secret, request ID, error mapping.
2. `diffResponseSchema` and the contract test.
3. Comparison creation transaction, counts, failed rows, failed-row id response.
4. Comparison/changes/export/delete routes.
5. Changes API and failed-comparison reads.
6. Tests: same version, cross-project, service down, timeout, too many changes, bad response, reopen, failed export.

**Done when:** a comparison can be created and reopened; reopening works with the comparison client mocked to throw; failed comparisons are addressable and export correctly; counts match stored rows.

### Phase 5 — Workspace UI (2 days)

1. Comparison page Server Component + client workspace.
2. Header, tabs, change tree, filters/search, URL state.
3. Change detail with before/after, presence, usedBy, copy.
4. Counts tab.
5. Source diff tab with canonicalization, limits, viewer/fallback.
6. Failed/no-change/no-results/loading/error states.
7. Accessibility, responsive sidebar/drawer, dark mode.
8. Playwright script (section 18.7).

**Done when:** the full flow works; URL state survives reload; the tree is keyboard-usable; source diff shows canonical changes; failed comparisons work; Playwright passes.

### Phase 6 — Hardening and packaging (1 day)

1. Security headers, origin checks, rate limits, log review.
2. Docker Compose: migrate service, health checks, non-root, caps, test profile.
3. README: prerequisites, Supabase setup, env, local dev, Docker, tests, troubleshooting.
4. Full acceptance run from a clean clone.
5. Performance smoke and final `docs/notes.md` update.

**Done when:** `docker compose up` works from a fresh clone with a filled `.env`; all tests pass; the acceptance checklist is complete.

### 19.1 Cut order if time runs short

1. Export button.
2. Source diff unified toggle.
3. Source diff tab, keeping the Changes tab.
4. Counts tab, keeping the header counts.
5. Syntax highlighting, keeping plain monospace.
6. Dark mode.
7. Delete comparison UI (keep the route).
8. UsedBy click-to-select (keep the list).

Never cut: normalizer tests, ownership checks, `toChangeRow` tests, reopen test, Day 0 gate, upload validation, external-ref protection, failed-comparison id path.

### 19.2 Parallelisation

- Phase 1 (Go) and Phase 2 (auth/DB) can overlap once Phase 0 is done.
- Phase 3 depends on Phase 2.
- Phase 4 depends on Phase 1 and Phase 2.
- Phase 5 depends on Phase 4.
- Do not start the workspace before the comparison contract is stable.

---

## 20. Docker Compose and operations

### 20.1 Compose services

- `db` (test profile only, `docker-compose.test.yml`): PostgreSQL 16, port 5433, named volume.
- `migrate`: built from `web/Dockerfile` target `migrator`; runs `prisma migrate deploy` with `DIRECT_URL`; one-shot; retries on connection failure.
- `web`: built from `web/Dockerfile` target `runner`; port `3000:3000`; env from `web/.env`; depends on `migrate` completed and `comparison-service` healthy; health check on `/api/health`; `init: true`; `restart: unless-stopped`.
- `comparison-service`: built from `comparison-service/Dockerfile`; no published ports; env from `comparison-service/.env`; health check on `/health`; `init: true`; `restart: unless-stopped`; internal network only.

Production Compose does not run PostgreSQL; Supabase is external. The test Compose file is separate.

### 20.2 Web Dockerfile

Stages:

1. `deps`: install dependencies from lockfile.
2. `build`: `prisma generate`, `next build`.
3. `migrator`: Node + Prisma CLI + schema + migrations; command `prisma migrate deploy`; used by the one-shot service.
4. `runner`: Node 22 Alpine, `NODE_ENV=production`, non-root `nextjs` user, copies `.next/standalone`, `.next/static`, `public`, and Prisma runtime files; command `node server.js`.

Add `.dockerignore` for `node_modules`, `.next`, `.git`, tests, and local env files.

### 20.3 Go Dockerfile

- Multi-stage: `golang:1.27-alpine` build → `alpine` runtime.
- Build with `CGO_ENABLED=0`, `-trimpath`, `-ldflags="-s -w"`.
- Download the pinned oasdiff release for `TARGETARCH`.
- **Verify the SHA-256** before installing.
- Install `ca-certificates` and `wget` (for health check).
- `adduser -S app`, run as `app`.
- `ENV OASDIFF_BIN=/usr/local/bin/oasdiff`.
- `EXPOSE 8080`.
- Health check: `wget -qO- http://127.0.0.1:8080/health || exit 1`.

### 20.4 Health checks

- Go: `/health` returns 200 only after the engine version is cached.
- Web: `/api/health` returns 200 only when the DB ping succeeds.
- Set `start_period: 60s` for web because migrations may run first.
- Compose `depends_on` uses `condition: service_healthy` / `service_completed_successfully`.

### 20.5 Local development

Option A (recommended for UI work): run Supabase or local PostgreSQL, `npm run dev` in `web`, and `go run ./cmd/server` in `comparison-service` with `OASDIFF_BIN` pointing at the local binary.

Option B (full stack): `docker compose up --build`.

### 20.6 Supabase setup

1. Create a Supabase project.
2. Copy the pooled connection string to `DATABASE_URL`; add `pgbouncer=true`, `connection_limit=5`, `sslmode=require`.
3. Copy the direct or session-pooler connection string to `DIRECT_URL`.
4. Run `npx prisma migrate deploy` once (or use the Compose `migrate` service).
5. Fill `JWT_SECRET`, `COMPARISON_SHARED_SECRET`, `APP_ORIGIN`, `COOKIE_SECURE`.
6. Never commit `.env`.

### 20.7 README contents

- Prerequisites: Node 22, Go 1.27, Docker, Supabase account, pinned oasdiff.
- Quick start with Docker Compose.
- Local development without Docker.
- Environment variable tables.
- Supabase setup and pooler notes.
- Test commands (`go test`, `npm test`, `npm run test:e2e`).
- How to regenerate fixtures and run the Day 0 gate.
- Troubleshooting: cookie not set, migration connection, oasdiff missing, IPv6 direct URL, port conflicts, large spec limits.
- Security limitations (token revocation, rate limits).

### 20.8 Operational notes

- No backup/restore UI; Supabase handles backups.
- No retention job; comparisons persist until deleted.
- Logs go to container stdout.
- Do not expose the comparison service port.
- Do not put secrets in build args that end up in image layers.

---

## 21. Docs templates

### 21.1 `docs/notes.md`

```markdown
# Engine notes

## Pinned versions
- oasdiff tag:
- oasdiff commit:
- oasdiff SHA-256 (linux/amd64, linux/arm64):
- Go:
- Node:

## Confirmed oasdiff behaviour
- validate exit codes:
- validate JSON shape:
- diff key mappings (`max`, `min`, `exclusiveMax`, `operationID`, `securityRequirements`, headers):
- external-ref flag behaviour:
- output caps:

## Fixture results
| Fixture | validate exit | raw diff notes |
|---|---|---|

## YAML parity
| Case | Go | Web | Decision |
|---|---|---|---|

## Known differences from DIFFORA.md
- (record and link to the section that was updated)
```

### 21.2 `docs/decisions.md`

```markdown
# Decisions

## 2026-11-17 — Next.js 16 proxy
- Context:
- Decision: use `src/proxy.ts`, Node runtime, JWT verification only.
- Consequences:

## 2026-11-17 — Cache Components off
- Context:
- Decision:
- Consequences:

## 2026-11-17 — Raw diff as text
- Context:
- Decision:
- Consequences:
```

Add a decision whenever this spec is amended.

---

## 22. Acceptance criteria

A build is accepted when all of the following are true:

- A user can register, log in, and log out; invalid credentials return the same error.
- A user can create, edit, and delete a project; another user gets 404.
- A user can upload YAML and JSON specs (3.0 and 3.1). Invalid files are rejected with clear, sanitized messages.
- Upload rejects wrong extension, oversize, invalid UTF-8, invalid YAML, multi-document YAML, duplicate label, unsupported OpenAPI version, and external refs.
- A user can compare any two different versions in a project; same-version and cross-project attempts are rejected.
- The comparison service runs the pinned oasdiff with fixed arguments and `--allow-external-refs=false`.
- Changes, counts, raw text, and warnings are stored in PostgreSQL.
- Reopening a comparison does not call the comparison service; a test enforces this, and an E2E test proves it with the service stopped.
- The workspace shows the change tree, counts, filters, before/after values, presence, and transitive `usedBy`.
- Present `null` and absent values are visually distinct.
- Search, filters, tab, and selection persist in the URL across reload and back/forward.
- The source diff uses canonical text, shows a note about canonical line numbers, and handles oversized input.
- Failed comparisons are addressable, show a sanitized error, and can be re-run.
- Comparisons export as JSON with `exportVersion`, `comparison`, `changes`, and `rawDiff`.
- Deleting a comparison removes its changes; deleting a project removes versions and comparisons.
- No breaking, severity, compatibility, changelog, or summary output appears in the app or export.
- All fixture pairs pass the golden tests; the contract test passes; Playwright passes.
- `docker compose up` works from a fresh clone with a filled `.env`.
- The app works on `http://localhost:3000` (cookie `Secure` off) and is configurable for HTTPS (`COOKIE_SECURE=true`).
- Security headers are present; raw viewer is `text/plain` with `nosniff`; comparison service has no published port.
- The README explains setup, Supabase, tests, and troubleshooting.

---

## 23. Open decisions and risks

| Item | Decision for this build | Risk if changed later |
|---|---|---|
| Next.js caching | `cacheComponents: false`; dynamic authenticated pages | Enabling Cache Components later requires Suspense and instant-navigation work. |
| Proxy vs middleware | `proxy.ts` (Next 16) | Reverting to `middleware.ts` is deprecated and unnecessary. |
| Cookie `Secure` | `COOKIE_SECURE` env, default false for local HTTP | A misconfigured production deploy could ship an insecure cookie; validate in deployment. |
| Raw diff storage | Exact stdout in `rawDiffText` | Storage grows; acceptable at demo size. |
| Change limit | 5000, enforced in Go and web | Larger limits need pagination and a server-side count query. |
| `usedBy` | Transitive; callbacks/links excluded | More normalizer work if full traversal is required. |
| Token revocation | None | A leaked token stays valid until expiry. |
| Sharing/public links | Not included | Needs an access table and permission checks on every route. |
| Source diff mapping | Canonical text only | Mapping to uploaded lines needs a line-index step in the normalizer. |
| YAML parity | Custom YAML 1.2 resolver in Go; JS core schema | A new YAML feature can still diverge; parity tests must grow. |
| Supabase pooler | Pooled URL + direct/session-pooler migrations | IPv6-only direct hosts and transaction pooling can surprise; document fallback. |
| Diff viewer | `react-diff-viewer-continued` if React 19-compatible; else custom | A third-party incompatibility affects the Source diff tab only. |
| Auth rate limit | In-memory, best effort | Not a real security boundary; do not rely on it for production. |
| Email verification/reset | None | Account recovery is manual; accepted for demo. |
| Comparison service auth | Shared secret + internal network | Do not publish the port without mTLS/auth. |
| Failed comparison export | Zero changes, `rawDiff: null`, error message | Consumers must handle null raw diff. |
| Build estimate | ~10–11 focused days | The scope is larger than v1’s 12-hour estimate. |

---

## Appendix A — v1 → v2 changelog (short)

- Added the full review findings table (section 0).
- Updated the framework plan for Next.js 16.4.6 (`proxy.ts`, async params, `cacheComponents` off, standalone output).
- Fixed repository naming and the `src/` layout.
- Fixed the oasdiff contract: exact commands, `--allow-external-refs=false`, validate JSON, exit codes, output caps, pinned version.
- Replaced guessed diff keys with real observed keys and mapping rules.
- Made component attribution and `usedBy` side-aware and transitive.
- Changed raw diff storage from `jsonb` to exact text.
- Added failed-comparison ids to error responses and export behaviour.
- Added upload hardening (BOM, UTF-8 fatal, multi-doc, duplicate keys, size precheck).
- Added YAML parity rules and tests.
- Added the missing dashboard/version-page query paths.
- Added the full error-code catalogue, health endpoint, no-store rules, and security headers.
- Added a test database, contract test, YAML parity test, and stronger E2E.
- Replaced the two-day estimate with a six-phase, end-to-end plan and an explicit cut order.
- Added docs templates and an expanded acceptance checklist.
