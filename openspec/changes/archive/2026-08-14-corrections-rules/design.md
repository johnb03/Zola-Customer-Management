# Design: Corrections rules (static checker)

## Technical Approach

New `scripts/validate-report.sh`: bash wrapper + `python3` heredoc (convert-report.sh pattern: quoted `<<'PYEOF'`, `set -e`) checking the mechanical corrections.md subset (bold, spacing, pitch ≤ 5, word bans + work-saving exception, marks). Emits only rule ids + line numbers; exits 0/1/2. `scripts/smoke-test.sh` gains step 6: run the checker on the sandboxed fixture, exit 0 required. Semantics (SALSA, MARKS-JUDGMENT) stay manual/golden — never checked. Covers 9 requirements / 14 scenarios + pipeline-smoke-test ADDED requirement / 2 scenarios.

## Architecture Decisions

| Decision | Alternatives | Choice / Rationale |
|---|---|---|
| Structure | pure bash / pure python | bash wrapper + python3 heredoc: repo pattern; `re` handles accents/`—`; quoted heredoc = no expansion |
| Section detection | heading regex | exact stripped-line match on the 3 fixed headers; end at next `## `; pitch to EOF (8/14/22) |
| BAN matching | substring | word-boundary `re.I` regex; `$` literal — substring flags "precio" in "aprecio"; "peso" (weight) safe from `pesos` |
| BAN exception | bare "ahorro de trabajo" | allowed phrase `ahorr\w* (de )?trabajo en cocina`, strip-then-scan; bare phrase ambiguous → flagged |
| Output | per occurrence | deduped rule+line; SPACING prints both (privacy req) |
| Exit codes | all failures = 1 | 0 / 1 violations / 2 usage-IO; non-zero fails the step |
| MARKS | at-least-one | `(explícito)`/`(inferido)` count == 1 per `- **` line ("exactly one") |

## Detection Logic

| Rule id | Requirement | Exact rule (fixture) |
|---|---|---|
| `BOLD` | Bold format | in the 2 list sections each `- ` line: starts `**`; next `**` followed by ` —` (space+U+2014); none after. Fixture: 10/12/16 |
| `SPACING` | Blank-line separation | ≥1 blank line between consecutive list lines; prints both. Fixture: blank 11 |
| `PITCH` | Pitch limit | non-empty lines header→EOF; >5 → first. Fixture: 24-26 = 3; absent → skip |
| `BAN` | Price/cost ban | whole file; per line strip `ALLOWED_RE` then scan `BAN_RE` (`re.I`). Fixture: 12 allowed, none else |
| `MARKS` | Explicitness marks | `- **` lines under Productos: `\((explícito|inferido)\)` count == 1. Fixture: 10 explícito, 12 inferido |
| `SALSA`/`MARKS-JUDGMENT` | semantic rules | documented-only; checker MUST NOT attempt |
| drift guard | Rule drift guard | spec-level scenario; no code |

BAN contract:

```python
ALLOWED_RE = re.compile(r"\bahorr\w*\b\s+(?:de\s+)?trabajo\s+en\s+cocina\b", re.IGNORECASE)
BAN_RE     = re.compile(r"\$|\b(?:precio|mayoreo|descuento|costo|pesos|barato|ahorr\w*)\b", re.IGNORECASE)
# per line: probe = ALLOWED_RE.sub("", line); BAN_RE.search(probe) → violation
```

Works: "ahorran trabajo en cocina" PASS; "ahorro de trabajo" BAN; "apreciamos"/"peso" PASS; "$500" BAN.

## Data Flow

```
validate-report.sh <md>
  bash gate (exit 2) → python3: read lines → locate sections →
  BOLD/SPACING (2 list sections), PITCH (→EOF), BAN (all lines),
  MARKS (Productos) → print "RULEID <line>" → exit 0|1
smoke step 6 runs it on the sandboxed fixture
```

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/validate-report.sh` | Create | checker ~110-120 lines, `chmod +x`; auto-covered by step-1 `bash -n` + sandbox cp |
| `scripts/smoke-test.sh` | Modify | step-6 function + step call + header comment (~13 lines) |
| `README.md` | Modify | Verificación note, Spanish (~8-10 lines) |

**Budget: ~135-150 authored lines (checker ~120 + smoke ~13 + README ~10) — 400-line guard risk: Low.**

## Interfaces / Contracts

- `./scripts/validate-report.sh <ruta>`; exit 0 / 1 violations / 2 usage-IO.
- Output (privacy): deduped ids+numbers only — `BOLD <n>` `SPACING <a>,<b>` `PITCH <n>` `BAN <n>` `MARKS <n>`.
- Wrapper: `set -e`; `python3 - "$MD_FILE" <<'PYEOF'`; POSIX-safe.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Syntax | checker | `bash -n` (step 1 glob) |
| Regression | fixture | smoke step 6 exit 0 (scen. 1) |
| Negative | 5 violation classes | adversarial report → id+line, exit 1 (verify) |
| Exit semantics | usage/IO | missing arg/file → exit 2, stderr |
| Privacy | no leakage | output only `^[A-Z]+( \d+(,\d+)?)?$` |
| Regression naming | broken checker | step 6 named by ERR trap (scen. 2) |

## Threat Matrix

| Boundary | Applicability | Design response |
|---|---|---|
| Documentation-like paths | Applicable (narrow) | `.md` = inert data (`open()` only; no eval/shell). RED: `` `whoami` `` / `$(...)` in report → exit 0, no execution |
| Git repository selection | N/A — never invokes git |
| Commit state | N/A — no git index |
| Push state | N/A — no git push |
| PR commands | N/A — no PR automation |

Subprocess (step 6): fixture exit 0 → pass; checker non-zero → ERR trap names it. RED: scen. 2.

## Migration / Rollout

No migration. Rollback: delete checker, revert step 6 + README note.

## Open Questions

None.
