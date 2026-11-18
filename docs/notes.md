# Engine notes

Recorded during Phase 0 on 2026-11-17. This file is the evidence behind the engine contract, fixtures, and the thin v3 service.

## Pinned versions

| Item | Value |
|---|---|
| oasdiff release | `v1.38.0` |
| Release URL | https://github.com/oasdiff/oasdiff/releases/tag/v1.38.0 |
| Local binary | `tools/oasdiff/v1.38.0/oasdiff.exe` (gitignored) |
| `oasdiff --version` | `oasdiff version 1.38.0` |
| Go | `go1.27.4 windows/amd64` |
| Node | `v22.13.1` |
| npm | `10.8.3` |

### SHA-256 checksums

| Asset | SHA-256 |
|---|---|
| `oasdiff_1.38.0_windows_amd64.tar.gz` | `4509a5d838849ab39c759b6ed95a0b9193b80a69e55b88c6c9e72d7bde21bbcf` |
| `oasdiff_1.38.0_linux_amd64.tar.gz` | `613037fd6a1d3362a1b742d6d86c338c0eb5ab3511f4942ce3948e78720ea2da` |
| `oasdiff_1.38.0_linux_arm64.tar.gz` | `a5ebb16d90f729f6b436a92d3054c11ba5633ddfb639dfdfb64b0023cd03680c` |
| `oasdiff_1.38.0_windows_arm64.tar.gz` | `2e562ef56a6447fef0fc35158c390455fff843a4e10e862aded3fb7102bc9b89` |

The Windows and Linux amd64 hashes above were verified against the published `checksums.txt` with `Get-FileHash -Algorithm SHA256`.

## Exact commands

```text
oasdiff validate input.json -f json --allow-external-refs=false
oasdiff diff base.json target.json -f json --allow-external-refs=false
oasdiff --version
```

No other subcommand is used at runtime. `breaking`, `changelog`, `summary`, `checks`, `schema`, `flatten`, `upgrade`, `breaking-files`, and `git-diff-driver` are excluded.

## Confirmed validate behaviour

- Exit `0`: valid. Warnings/info findings do not fail the default `--fail-on ERR`.
- Exit `1`: one or more error findings.
- Exit `102`: the spec could not be loaded.
- Exit `123`: the loader rejected a disallowed external reference. This happens even for a syntactically valid spec when `--allow-external-refs=false`.
- Validation JSON is an array of findings with `id`, `text`, `level`, `section`, `source`, and `fingerprint`.

Example finding:

```json
[
  {
    "id": "path-parameters-mismatch",
    "text": "operation DELETE /pets/{petId} must define exactly all path parameters (missing: [petId])",
    "level": 3,
    "section": "paths",
    "source": { "file": "v1.yaml", "line": 22, "column": 3 },
    "fingerprint": "16142b71630c"
  }
]
```

The Go service must return only `text` plus the line, with `file`, `id`, `level`, `section`, and `fingerprint` removed. It must not surface engine severity words.

## Confirmed diff key names and shapes

- Numeric constraints: `max`, `min`, `exclusiveMax`, `exclusiveMin` map to `maximum`, `minimum`, `exclusiveMaximum`, `exclusiveMinimum`.
- Operation field: `operationID` maps to `operationId`.
- Operation security: `securityRequirements` maps to `security`.
- Header names are lower-cased by the engine (`X-Rate-Limit` becomes `x-rate-limit`). Resolution must be case-insensitive.
- Type changes are represented as `type: { "added": [...], "deleted": [...] }`, not `{ from, to }`.
- Methods are uppercase in `operations.added` / `.deleted` / `.modified` (`GET`, `DELETE`).
- `security` / `securityRequirements` use `added` / `deleted` arrays of `{ index, schemes }`.
- `webhooks.added` / `.deleted` are arrays of webhook names.
- `servers.added` / `.deleted` are arrays of URL strings.
- `components.securitySchemes.added` / `.deleted` are arrays of scheme names.
- `info.version` / `info.title` use `{ from, to }`.
- `info.extensions.modified.<x-key>` is an **array of edit operations**, not `{ from, to }`:

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

- `allOf.modified` is an **array of branch diffs**:

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

`oneOf` and `anyOf` are expected to use the same array shape; confirm in Phase 1 before relying on it.

- Changes can appear under an operation and under the component it references. The operation copy is often an inlined resolved schema, not a `$ref` change.
- `from: null` means the value did not exist on that side.

## Phase 1 service calls (v3)

The Go service now runs four commands in one temp directory:

```text
oasdiff diff      base.json target.json -f json --allow-external-refs=false
oasdiff changelog base.json target.json -f json --allow-external-refs=false
oasdiff summary   base.json target.json -f json --allow-external-refs=false
oasdiff breaking  base.json target.json -f json --allow-external-refs=false
```

Confirmed output:

- `changelog -f json` is an array of findings: `id`, `text`, `level`, `operation`, `operationId`, `path`, `section`, `revisionSource`, `fingerprint`.
- `summary -f json` is an object with `diff` and `details` counts by endpoints/paths/schemas.
- `breaking -f json` uses the same finding shape and contains only breaking items.
- `level` is `1` info, `2` warning, `3` error. The service also returns `levelName`.
- `revisionSource.file` and `fingerprint` are stripped from the public response.
- `deprecations` is extracted from `diff` where `deprecated` becomes `true`. Example: `/paths/~1pets/get/deprecated`.
- `changes` is the structured, deduplicated diff. It resolves `$ref` operation copies to component pointers and assigns categories such as endpoint, operation, parameter, request, response, header, schema, security, server, metadata, and webhook. The test pair produces 73 unique structured changes from 109 changelog findings.

The service writes the uploaded YAML/JSON as-is and passes it to oasdiff. There is no YAML converter, metadata extraction, or external-ref pre-scan. Both inputs must use the same format; mixed formats return `400 FORMAT_MISMATCH`. Every result is JSON.

The web app stores `rawDiffText` as text, `summary` and `deprecations` as JSON, and changelog/breaking items as individual `ComparisonFinding` rows for filtering. The full normalizer, `usedBy`, and `DetectedChange` table are not part of v3.

## Fixture results

Fixtures live in `comparison-service/testdata/pairs/<name>/`.

Each directory contains:

- `base.yaml`
- `target.yaml`
- `validation.json` — engine validate exit and raw findings for both files
- `raw.expected.json` — exact `oasdiff diff` output for valid pairs

`external-ref` intentionally has no `raw.expected.json`; it is rejected before diff. `invalid-target` is also an error fixture.

| Fixture | Base validate | Target validate | Diff |
|---|---:|---:|---:|
| `allof-usage` | 0 | 0 | 0 |
| `description-only` | 0 | 0 | 0 |
| `endpoint-added` | 0 | 0 | 0 |
| `endpoint-removed` | 0 | 0 | 0 |
| `enum-value-added` | 0 | 0 | 0 |
| `external-ref` | 123 | 123 | expected rejection |
| `identical` | 0 | 0 | 0 |
| `invalid-target` | 0 | 102 | expected rejection |
| `openapi-31` | 0 | 0 | 0 |
| `operation-description` | 0 | 0 | 0 |
| `operation-metadata` | 0 | 0 | 0 |
| `operation-removed` | 0 | 0 | 0 |
| `param-max-added` | 0 | 0 | 0 |
| `param-min-changed` | 0 | 0 | 0 |
| `param-reordered` | 0 | 0 | 0 |
| `property-added` | 0 | 0 | 0 |
| `property-removed` | 0 | 0 | 0 |
| `query-param-added` | 0 | 0 | 0 |
| `request-body-required` | 0 | 0 | 0 |
| `required-added` | 0 | 0 | 0 |
| `response-added` | 0 | 0 | 0 |
| `response-header-changed` | 0 | 0 | 0 |
| `response-schema-changed` | 0 | 0 | 0 |
| `security-changed` | 0 | 0 | 0 |
| `server-changed` | 0 | 0 | 0 |
| `shared-schema` | 0 | 0 | 0 |
| `transitive-usage` | 0 | 0 | 0 |
| `type-changed` | 0 | 0 | 0 |
| `webhook-added` | 0 | 0 | 0 |
| `yaml-anchors` | 0 | 0 | 0 |
| `yaml-quirks` | 0 | 0 | 0 |

`too-many-changes` is not committed as a fixture because its raw output is intentionally large. Generate it in a Go test at `MAX_CHANGES + 1` properties.

## YAML behaviour observed

- Unquoted `200` under `responses` is accepted and compared as the string key `"200"`.
- YAML 1.2-style values stay strings: `on` is `"on"`, `yes` is `"yes"`, `2024-01-01` is a string. The engine diff treats them as extension string values.
- Anchors and aliases resolve before diffing; `yaml-anchors` produces a normal `properties.added` change.
- Merge keys, duplicate keys, multi-document files, and custom tags are not yet covered by a fixture. Add them when the app needs to distinguish these cases; oasdiff currently decides whether a file is acceptable.

## Default `--allow-external-refs=false`

The flag is required for SSRF safety. A spec containing `./other.yaml#/components/schemas/Other` fails at load with exit `123`. The thin service maps exit `123` to `EXTERNAL_REF_NOT_SUPPORTED`; there is no separate pre-scan.

## Known differences from DIFFORA.md

The following were absent from the v2 draft and have been added:

1. Validate exit code `123` for disallowed external references.
2. `info.extensions.modified` edit-operation arrays.
3. `allOf.modified` branch-diff arrays; `oneOf`/`anyOf` are not used by the v3 service.
4. `external-ref` fixture expects rejection, not a normal diff.
5. `too-many-changes` is generated at test time rather than committed.

## Commands used to build the fixture set

```powershell
node docs/day1/generate-fixtures.mjs
$o = (Resolve-Path .\tools\oasdiff\v1.38.0\oasdiff.exe).Path
# For each pair:
& $o validate base.yaml -f json --allow-external-refs=false
& $o validate target.yaml -f json --allow-external-refs=false
& $o diff base.yaml target.yaml -f json --allow-external-refs=false
```
