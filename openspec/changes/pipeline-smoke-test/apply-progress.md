# Apply Progress: pipeline-smoke-test

**Mode**: Standard (strict_tdd: false per `openspec/config.yaml`; no test runner — the smoke test IS the configured `test_command`).

**Status**: 14/14 tasks complete. Ready for verify.

## Completed Tasks

- [x] 1.1 Create `test/fixtures/fixture-report.md` — synthetic Spanish report per AGENTS.md + corrections.md (2 bold items in Productos, 1 in Sustitutos, Gaps + Pitch as plain paragraphs, blank line between entries). Verify: `grep -c '^- \*\*' test/fixtures/fixture-report.md` == 3.
- [x] 1.2 Append `/.smoke-test.*/` to `.gitignore` (crash-leftover sandbox guard). Verify: `grep -qx '/.smoke-test.*/' .gitignore`.
- [x] 2.1 Create `scripts/smoke-test.sh` scaffold: `set -e` + `set -E`, `$0`-derived `REPO_ROOT`, `mktemp -d "$REPO_ROOT/.smoke-test.XXXXXX"`, `trap cleanup EXIT` + `trap 'exit 1' INT TERM`, POSIX-safe `step()` (global `STEP_NAME`, echo + run); step 1 runs the `bash -n` syntax gate first; scripts copied into sandbox, tessdata + templates symlinked, fixture copied to `reports/`, `cd "$SANDBOX"`.
- [x] 2.2 Step 2: python3 heredoc writes text-layer `inputs/menu-texto.pdf` (pure stdlib, 73 chars > 20); `extract-text.sh` → method `pdftotext`, keys present, text non-empty (`sys.exit(1)` on fail).
- [x] 2.3 Step 3: python3 stdlib (zlib/struct) writes `inputs/menu-imagen.png` (320x64); `extract-text.sh` → method `tesseract`, keys present (text unasserted).
- [x] 2.4 Steps 4–5: `convert-report.sh reports/fixture-report.md`; python3 validates output docx: readable zip, `word/document.xml` well-formed XML, count of `w:after="160"` == 3.
- [x] 2.5 `chmod +x scripts/smoke-test.sh`; verified `bash -n scripts/smoke-test.sh` and `test -x scripts/smoke-test.sh`.
- [x] 3.1 `openspec/config.yaml`: `apply.test_command` and `verify.test_command` → `scripts/smoke-test.sh` (2 lines). Verify: `grep -n 'test_command:' openspec/config.yaml` → lines 39/41.
- [x] 3.2 `README.md`: Spanish "Verificación" section + `test/` and `smoke-test.sh` in Estructura block. Verify: `grep -n 'smoke-test' README.md` → 3 refs.
- [x] 4.1 Clean run: `./scripts/smoke-test.sh` → exit 0; `ls -d .smoke-test.*` empty.
- [x] 4.2 RED syntax: `scripts/.__red.sh` with syntax error → exit 2 naming the script + step; removed; re-run → 0.
- [x] 4.3 RED envelope: step-2 assertion requiring absent key `source_filex` → exit 1 ("falta clave: source_filex", step 2 named); restored; re-run → 0.
- [x] 4.4 RED spacing: fixture cut to 2 list items → exit 1 ("w:after=\"160\" x2, se esperaba 3", step 5 named); restored; re-run → 0.
- [x] 4.5 Untouched check: `git status --porcelain -- menus data-json reports reportsDocx catalogo-data-base` empty after all runs; no `.smoke-test.*` leftovers.

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `./scripts/smoke-test.sh` clean run → exit 0. Step outputs: "envelope pdftotext OK", "envelope tesseract OK", "[OK] Espaciado aplicado a 3 párrafos de lista", "docx válido; w:after=\"160\" x3", "[OK] Smoke test del pipeline completado". |
| Runtime harness command/scenario and exact result | Real pipeline path: runtime-generated text-layer PDF (pure python3, 646 bytes) → `extract-text.sh` → `data-json/menu-texto.json` with `extraction_method: pdftotext` (73 chars extracted); runtime-generated PNG (366 bytes) → `extraction_method: tesseract`; `convert-report.sh` on committed fixture → valid `.docx` zip with well-formed `word/document.xml` and exactly 3 injected `w:after="160"`. All IO inside `mktemp` sandbox, removed by EXIT trap on success and failure. |
| Rollback boundary | `git revert 5f1107a` (feature commit) — additive files (`scripts/smoke-test.sh`, `test/fixtures/`) removed, `.gitignore` guard and the 2 `test_command` config lines reverted; planning-artifacts commit `893a03b` untouched. |

## RED Tests (threat matrix → E2E)

| Test | Injection | Expected | Actual |
|---|---|---|---|
| 4.2 syntax | `scripts/.__red.sh` with unterminated quote | non-zero naming the script | exit 2; `scripts/.__red.sh: line 2: unexpected EOF while looking for matching \`"'`; `[ERROR] Fallo en el paso: 1: sintaxis de scripts...`; sandbox cleaned; re-run after removal → 0 |
| 4.3 envelope | step-2 assertion requires absent `source_filex` | non-zero | exit 1; `falta clave: source_filex`; `[ERROR] Fallo en el paso: 2: ...`; sandbox cleaned; restore → re-run 0 |
| 4.4 spacing | fixture cut to 2 list items | non-zero (== 3 fails) | exit 1; `Espaciado aplicado a 2 párrafos de lista`; `w:after="160" x2, se esperaba 3`; `[ERROR] Fallo en el paso: 5: ...`; sandbox cleaned; restore → re-run 0 |
| 4.5 untouched | — | empty porcelain on real data dirs | empty; no `.smoke-test.*` leftovers |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/smoke-test.sh` | Created | POSIX-safe runner (201 lines, executable): steps 1–5, python3 heredoc generators/assertions, EXIT/INT/TERM traps, `set -e` + `set -E`, step() wrapper |
| `test/fixtures/fixture-report.md` | Created | Synthetic Spanish report, exactly 3 list items, no real data |
| `.gitignore` | Modified | `/.smoke-test.*/` sandbox guard (crash leftover protection) |
| `openspec/config.yaml` | Modified | `apply.test_command` + `verify.test_command` → `scripts/smoke-test.sh` |
| `README.md` | Modified | Spanish "Verificación" section + `test/` and `smoke-test.sh` in Estructura |
| `openspec/changes/pipeline-smoke-test/tasks.md` | Modified | All 14 tasks marked `[x]` |

## Deviations from Design

1. **Syntax gate glob** — design line: `bash -n "$REPO_ROOT"/scripts/*.sh`. Implemented as POSIX for-loop over `*.sh` + `.[!.]*.sh` with `[ -f ] || continue` guard. Justification: bash `*` does NOT match dotfiles (verified empirically, bash 5.3), so RED 4.2's `scripts/.__red.sh` would have passed undetected; task 4.2 mandates catching hidden scripts.
2. **`set -E` (errtrace) added** — bash's ERR trap does not fire for failures inside functions without it (verified empirically); without it the design's "failing step named" contract was silently lost. Fail-fast (`set -e`) and step naming both now work.
3. **RED 4.3/4.4 revert mechanism** — tasks.md says `git checkout scripts/smoke-test.sh` / `git checkout test/fixtures/fixture-report.md`; both files are untracked before commit, so `git checkout` errors ("pathspec did not match"). Used explicit backup copies instead (identical restore intent). Commits happened only after all RED tests passed, per orchestrator instruction.
4. **Line count** — `smoke-test.sh` is 201 lines vs ~150 forecast (heredoc generators + 3 assertion blocks); implementation total 254 changed lines, still well under the 400 budget.

## Issues Found

- bash 5.3 ERR-trap silence inside functions (deviation 2 above) — resolved with `set -E`.
- bash `*` glob does not match dotfiles (deviation 1 above) — resolved with dual-glob for-loop.
- tesseract with `-l spa+eng --tessdata-dir <project tessdata>` (only `spa.traineddata` present) fails to load `eng` but exits 0 with empty text — envelope + method assertions unaffected (text correctly unasserted); mirrors real project OCR behavior.

## Status

14/14 tasks complete. Ready for verify.
