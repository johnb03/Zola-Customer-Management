# Tasks: Pipeline Regression Smoke Test

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~215 (smoke-test.sh ~150, fixture ~45, config 4, README ~12, .gitignore 1) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Full change: runner + fixture + wiring + docs | PR 1 | `scripts/smoke-test.sh` (expect exit 0) | Real: runtime-generated PDF/PNG + pandoc docx inside mktemp sandbox | `git revert` — additive files + 2 config lines |

## Phase 1: Foundation

- [x] 1.1 Create `test/fixtures/fixture-report.md` — synthetic Spanish report per AGENTS.md + corrections.md: `## Productos a ofrecer` (2 bold `**Producto (código, empaque)**` items), `## Posibles sustitutos / matches parciales` (1 bold item), `## Gaps` + `## Pitch sugerido` (≤5 lines) as plain paragraphs, blank line between list entries; exactly 3 list items; no real client/catalog/menu data. Verify: `grep -c '^- \*\*' test/fixtures/fixture-report.md` == 3.
- [x] 1.2 Append `/.smoke-test.*/` to `.gitignore` (crash-leftover sandbox guard). Verify: `grep -qx '/.smoke-test.*/' .gitignore`.

## Phase 2: Core Runner

- [x] 2.1 Create `scripts/smoke-test.sh` scaffold: `set -e`, `$0`-derived `REPO_ROOT`, `mktemp -d "$REPO_ROOT/.smoke-test.XXXXXX"`, `trap cleanup EXIT` (`rm -rf` sandbox), `trap 'exit 1' INT TERM`, POSIX-safe `step()` (global `STEP_NAME`, echo + run; no `local`/`[[ ]]`/process substitution); step 1: `bash -n "$REPO_ROOT"/scripts/*.sh` gate runs first; `cp` scripts into sandbox, `ln -s` tessdata + templates, `cd "$SANDBOX"`.
- [x] 2.2 Step 2: python3 heredoc writes text-layer `inputs/menu-texto.pdf` (>20 chars); run `extract-text.sh` → assert keys `source_file`/`extraction_method`/`text`, method == `pdftotext`, text non-empty (`sys.exit(1)` on fail).
- [x] 2.3 Step 3: python3 stdlib (zlib/struct) writes `inputs/menu-imagen.png`; run `extract-text.sh` → assert keys + method == `tesseract` only (text unasserted).
- [x] 2.4 Steps 4–5: `convert-report.sh reports/fixture-report.md`; python3 validates output docx: readable zip, `word/document.xml` well-formed XML, count of `w:after="160"` == 3.
- [x] 2.5 `chmod +x scripts/smoke-test.sh`; verify `bash -n scripts/smoke-test.sh` and `test -x scripts/smoke-test.sh`.

## Phase 3: Wiring

- [x] 3.1 `openspec/config.yaml`: set `apply.test_command` and `verify.test_command` to `scripts/smoke-test.sh` (2 lines). Verify: `grep -n 'test_command:' openspec/config.yaml`.
- [x] 3.2 `README.md`: Spanish "Verificación" note (run `scripts/smoke-test.sh`, sandboxed, real data untouched) + add `scripts/smoke-test.sh` and `test/` to the Estructura block. Verify: `grep -n 'smoke-test' README.md`.

## Phase 4: Verification (E2E + RED)

- [x] 4.1 Clean run: `scripts/smoke-test.sh` → exit 0; `ls -d .smoke-test.*` empty (scenarios: clean passes, real data untouched).
- [x] 4.2 RED syntax: create `scripts/.__red.sh` with syntax error → run → non-zero naming the script; remove file; re-run → 0.
- [x] 4.3 RED envelope: temporarily make step-2 assertion require absent key (e.g., `source_filex`) → run → non-zero; `git checkout scripts/smoke-test.sh`; re-run → 0.
- [x] 4.4 RED spacing: temporarily cut fixture to 2 list items → run → non-zero (== 3 fails); `git checkout test/fixtures/fixture-report.md`; re-run → 0.
- [x] 4.5 Untouched check: `git status --porcelain -- menus data-json reports reportsDocx catalogo-data-base` empty after all runs; no `.smoke-test.*` leftovers.
