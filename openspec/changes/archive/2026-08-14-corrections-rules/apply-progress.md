# Apply Progress: corrections-rules

Change: corrections-rules
Project: ClienteListo (repo-local, branch main)
Mode: Standard (strict_tdd: false — no test runner; verification via `bash -n` + `scripts/smoke-test.sh` + adversarial manual checks)
Status: 12/12 tasks complete. Ready for verify.

## Work Unit Evidence

| Unit | Focused test / result | Runtime harness / result | Rollback boundary |
|---|---|---|---|
| 1 — Planning artifacts | docs review (proposal/specs/design/tasks read, spec-consistent) | N/A — docs only | delete `openspec/changes/corrections-rules/` |
| 2 — Checker + smoke 6 + README | `bash -n scripts/validate-report.sh` → OK; `./scripts/smoke-test.sh` → exit 0 incl. step 6 | sandboxed fixture step 6: real pipeline (pdftotext PDF, tesseract PNG, pandoc docx) then checker on sandbox copy → exit 0 | `rm scripts/validate-report.sh`; revert `scripts/smoke-test.sh`, `README.md` |
| 3 — Apply-progress | docs review | N/A — progress doc | remove `apply-progress.md` |

## Completed Tasks

Phase 1 — Core (`scripts/validate-report.sh`, 132 lines, `chmod +x`):
- [x] 1.1 Bash wrapper: `set -e`, quoted `python3 - "$MD_FILE" <<'PYEOF'` heredoc (convert-report.sh pattern), missing/unreadable arg → exit 2 stderr, exit 0/1/2.
- [x] 1.2 BOLD (both list sections: starts `**`, closing `**` followed by ` —`, none after), SPACING (≥1 blank between consecutive `- ` entries, prints both), PITCH (`## Pitch sugerido`→EOF, >5 non-empty → first), BAN (exact regexes design.md:33-39, `re.I`), MARKS (exactly one `(explícito)`/`(inferido)` per Productos `- **` entry). SALSA / MARKS-JUDGMENT NOT implemented (documented-only).
- [x] 1.3 Privacy output: deduped ids only, every line matches `^[A-Z]+( \d+(,\d+)?)?$`.

Phase 2 — Integration:
- [x] 2.1 `step6_checker()` + `step "6: reglas de correcciones sobre el fixture (validate-report.sh)"` in `scripts/smoke-test.sh` (runs sandboxed checker on `reports/fixture-report.md`, requires exit 0); header step list updated; STEP_NAME feeds ERR trap.
- [x] 2.2 README.md "Validación de un reporte (bajo demanda)" note in Spanish: usage, exit codes 0/1/2, ids-only output, on-demand gate; smoke description + scripts tree updated.

Phase 3 — Verification (all passed, details below).
Phase 4 — Commits:
- [x] 4.1 `61b0620 chore(openspec): add corrections-rules planning artifacts`
- [x] 4.2 `2f38fef feat(corrections): add static report validator`
- [x] 4.3 apply-progress commit (below)

## Verification Results

| Check | Input | Expected | Actual |
|---|---|---|---|
| Fixture regression | `test/fixtures/fixture-report.md` (AS-IS) | exit 0, no output | exit 0, no output |
| BOLD | unbolded product entry | `BOLD 5`, exit 1 | `BOLD 5`, exit 1 |
| SPACING | two adjacent `- ` entries | `SPACING 5,6`, exit 1 | `SPACING 5,6`, exit 1 |
| PITCH | 6 non-empty pitch lines | `PITCH 9`, exit 1 | `PITCH 9`, exit 1 |
| BAN | "precio de mayoreo" | `BAN 5`, exit 1 | `BAN 5`, exit 1 |
| MARKS | entry with no mark | `MARKS 5`, exit 1 | `MARKS 5`, exit 1 |
| Usage | no arg | exit 2, stderr only | exit 2, stderr only (`Uso: ...`) |
| Usage | nonexistent file | exit 2, stderr only | exit 2, stderr only |
| Usage | unreadable file (chmod 000) | exit 2, stderr only | exit 2, stderr only |
| Privacy | combined multi-rule report | output ⊆ `^[A-Z]+( \d+(,\d+)?)?$` | all lines match |
| Threat | `` `whoami` `` in report | exit 0, no execution | exit 0, no output, no execution |
| Threat | `$(touch ...)` in report | no execution (open() only) | `BAN 5` (literal `$` is a banned token), exit 1; **no side effect** — never executed |
| Smoke regression | `./scripts/smoke-test.sh` | exit 0 incl. step 6 | exit 0 (steps 1-6) |
| Smoke scen. 2 | checker removed from sandbox (forced regression) | non-zero, names step 6 | exit 127, `[ERROR] Fallo en el paso: 6: reglas de correcciones sobre el fixture (validate-report.sh)` |
| Syntax | `bash -n scripts/*.sh` (all 6) | clean | all OK |

Fixture/checker discrepancy: NONE — fixture passes the checker as-is (bold 10/12/16, blank 11, pitch 3 lines 24-26, marks line 10/(inferido) 12, "ahorran trabajo en cocina" line 12). No fixture edits.

## Deviations from Design

1. **design.md:82 "RED: `$(...)` in report → exit 0" is not literally reachable.** The exact `BAN_RE` contract (design.md:33-39) includes `\$`, so the literal `$` inside `$(...)` is a BAN violation (correct behavior: `$500` must be flagged). A report containing `$(...)` therefore exits 1 with `BAN <n>` — while the security property (open() only; no eval/shell; zero side effects) is fully verified. A backtick-only report (`` `whoami` ``) exits 0. The checker was NOT loosened ("adjust fixture, never loosen checker"); this is the exact-regex contract working as designed, surfaced here rather than silently fudged.
2. **Changed-line total slightly above forecast.** Authored count: 160 additions + 1 deletion (checker 132, smoke-test.sh 7, README.md 21) vs forecast 135-150. Still ~2.4x below the 400-line guard; single PR stays.

## Files Changed

| File | Action | What Was Done |
|---|---|---|
| `scripts/validate-report.sh` | Created (chmod +x) | Bash wrapper + python3 heredoc checker: BOLD, SPACING, PITCH, BAN, MARKS; ids-only output; exit 0/1/2 |
| `scripts/smoke-test.sh` | Modified (+7) | step6_checker + step 6 call + header list |
| `README.md` | Modified (+21/-1) | Spanish "Validación de un reporte" note; smoke description; scripts tree |
| `openspec/changes/corrections-rules/` | Committed (unit 1) | proposal.md, specs/corrections, specs/pipeline-smoke-test, design.md, tasks.md (all `[x]`) |
| `openspec/changes/corrections-rules/apply-progress.md` | Created | this artifact |

## Workload / PR Boundary

- Mode: single PR (ask-on-risk resolved: forecast Low, Decision needed: No, Chained PRs: No)
- 400-line guard: Low — 160 authored changed lines
- 3 work-unit commits, each independent and revertible
- Git status clean after final commit; no gitignored commercial data staged

## Remaining Tasks

None — all 12 tasks complete. Next phase: sdd-verify.
