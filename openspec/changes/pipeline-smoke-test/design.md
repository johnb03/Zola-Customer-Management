# Design: Pipeline Regression Smoke Test

## Technical Approach

One POSIX-safe bash runner (`scripts/smoke-test.sh`) that builds a throwaway mirror of the repo inside a `mktemp` sandbox under the repo root, then exercises the deterministic pipeline stages in order — shell syntax → text-layer PDF extraction → PNG extraction → docx conversion/validation — asserting JSON envelope shape and docx list-spacing injection via inline `python3` heredocs (same `python3 - args <<'PYEOF'` pattern as `convert-report.sh`). `set -e` + ERR trap + `step()` wrapper propagate failures with the failing step named; EXIT trap guarantees sandbox removal on success and failure. Committed synthetic fixture `test/fixtures/fixture-report.md` reproduces the empirically verified result of exactly 3 `w:after="160"` injections. Answers all 9 requirements / 12 scenarios of `openspec/specs/pipeline-smoke-test/spec.md`.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Sandbox location | `mktemp -d "$REPO_ROOT/.smoke-test.XXXXXX"` | /tmp | Repo-local per config; same filesystem (cheap links); `.gitignore` guard `/.smoke-test.*/` protects against crash leftovers |
| Cleanup | `trap cleanup EXIT` + `trap 'exit 1' INT TERM` | none | EXIT covers success and `set -e` aborts; INT/TERM route through EXIT; `rm -rf` never follows symlinks |
| scripts/ in sandbox | `cp` (after `bash -n`) | symlink | `SCRIPT_DIR` must resolve inside sandbox so `../tessdata` = `$SANDBOX/tessdata` → `spa+eng` found (verified, observation #117) |
| tessdata + templates | `ln -s` to repo (read-only) | cp | Saves 2.3 MB; extract-text.sh only reads tessdata; cleanup removes links, never targets |
| Working dir | `cd "$SANDBOX"` once; absolute `$REPO_ROOT` elsewhere | per-step subshell | CWD-relative outputs (`data-json/`, `reportsDocx/`, `templates/`) land in sandbox; avoids subshell ERR-trap double-fire |
| Input basenames | `menu-texto.pdf`, `menu-imagen.png` | shared `menu-smoke` | Both would write `data-json/menu-smoke.json`; distinct names remove the overwrite footgun |
| Spacing assertion | `w:after="160"` count == 3 | ≥1 (spec floor) | Empirically verified exactly 3 (#117); pins fixture shape, satisfies ≥1; loosen to ≥1 only on pandoc drift (see Risks) |
| Fixture shape | exactly 3 list items (2 Productos + 1 Sustitutos); Gaps/Pitch plain paragraphs | 4th list for Gaps | pandoc emits one `numPr` paragraph per list item → 3 injections; a Gaps bullet would make 4 |
| LLM stage | not tested | mock/contract test | `run-analysis.sh` shells `opencode run`: non-deterministic, needs auth, reads real catalogs; its input contract (JSON envelope) IS tested |

## Data Flow

    smoke-test.sh
      │ mktemp sandbox; cp scripts/; ln -s tessdata templates; cp fixture; cd sandbox
      ├─ step 1: bash -n "$REPO_ROOT"/scripts/*.sh            (syntax gate, runs first)
      ├─ step 2: python3 ─► inputs/menu-texto.pdf (pure stdlib, text > 20 chars)
      │          extract-text.sh ─► data-json/menu-texto.json
      │          assert keys {source_file, extraction_method, text} + method=pdftotext + text≠""
      ├─ step 3: python3 ─► inputs/menu-imagen.png (stdlib zlib/struct)
      │          extract-text.sh ─► data-json/menu-imagen.json
      │          assert keys + method=tesseract (text unasserted)
      ├─ step 4: convert-report.sh reports/fixture-report.md ─► reportsDocx/fixture-report.docx
      └─ step 5: python3: zip ✓ / word/document.xml well-formed ✓ / w:after="160" == 3
      trap EXIT: rm -rf sandbox

No new env vars required by either script: base-dir resolution is `$0`-derived `SCRIPT_DIR` (sandbox copies), outputs are CWD-relative by input basename (`menu-texto`/`menu-imagen` → `data-json/*.json`; `fixture-report` → `reportsDocx/fixture-report.docx`).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/smoke-test.sh` | Create | POSIX-safe runner, ~150 lines, `chmod +x`; runtime PDF/PNG generation + docx validation as python3 heredocs |
| `test/fixtures/fixture-report.md` | Create | Synthetic Spanish report: Resumen + 3 list items (bold product lines, blank line between entries) + Gaps/Pitch as plain paragraphs |
| `openspec/config.yaml` | Modify | `apply.test_command` and `verify.test_command` → `scripts/smoke-test.sh` (exactly 2 lines) |
| `README.md` | Modify | "Verificación" usage note (Spanish) + `test/` and `smoke-test.sh` in structure block |
| `.gitignore` | Modify | Add `/.smoke-test.*/` (crash-leftover sandbox guard) |

## Interfaces / Contracts

- JSON envelope (extract-text.sh): `{"source_file", "extraction_method", "text"}` — PDF run asserts `method == "pdftotext"` and non-empty `text`; PNG run asserts keys + `method == "tesseract"` only (text content env-dependent, unasserted).
- Assertion heredocs: `python3 - <path> <<'PYEOF'` — quoted delimiter (no shell expansion), `sys.exit(1)` on failure; `set -e` aborts and ERR trap names the step via `STEP_NAME`.
- `step <name> <cmd...>`: sets global `STEP_NAME`, echoes the step, runs command; POSIX-safe (no `local`, `[[ ]]`, process substitution).
- Fixture contract: AGENTS.md report sections (`## Productos a ofrecer`, `## Posibles sustitutos / matches parciales`, `## Gaps`, `## Pitch sugerido`); corrections.md bold `**Producto (código, empaque)**` + blank line between entries; fully synthetic data — no real client, catalog, menu, or report content.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (step 1) | syntax of every `scripts/*.sh` | `bash -n` loop; failure names the script (set -e + ERR trap) |
| Integration (steps 2–3) | extraction envelope shape | runtime-generated PDF/PNG; python3 asserts per step |
| Integration (steps 4–5) | docx conversion validity | valid zip, well-formed `word/document.xml`, `w:after="160"` == 3 |
| E2E | exit-code semantics | 0 on clean tree; non-zero on injected regression (syntax error, missing envelope key, 2-injection docx) |
| Privacy | real data untouched | sandbox-only IO; scripts copied, links read-only; real data dirs never opened |

## Threat Matrix

| Boundary | Applicability | Reason / Design response |
|---|---|---|
| Documentation-like paths | N/A | No executable-markdown handling |
| Git repository selection | N/A | Script never invokes git |
| Commit state | N/A | No index/worktree interaction |
| Push state | N/A | No push/refspec logic |
| PR commands | N/A | No PR automation |

Subprocess boundary (pdftotext/tesseract/pandoc/python3/bash -n): safe behavior = any failing subprocess aborts via `set -e` with the step named; failure behavior = non-zero exit + sandbox removal via EXIT trap. Planned RED tests: injected syntax error → non-zero naming the script; JSON missing `source_file` → non-zero; docx with 2 injections → non-zero.

## Migration / Rollout

No migration. Rollback: `git revert` — additive files + 2 config lines restore `test_command: "bash -n scripts/*.sh"`.

## Open Questions

- None blocking. (Follow-up noted: corrections.md as spec domain — already out of scope per proposal.)
