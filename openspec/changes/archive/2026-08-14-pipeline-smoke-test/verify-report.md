```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:c7906848f27bc742d3d34b4ef6e35a1703054152b2c5a2ffb7f89d5edce1a4c4
verdict: pass
blockers: 0
critical_findings: 0
requirements: 9/9
scenarios: 12/12
test_command: scripts/smoke-test.sh
test_exit_code: 0
test_output_hash: sha256:e7ff28a0d9ba5f0362e871753b4abe1c271dd33bf909adfeca2bfcd1f4891cbe
build_command: ""
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: pipeline-smoke-test
**Version**: N/A (initial spec)
**Mode**: Standard (strict_tdd: false per `openspec/config.yaml`; the smoke test IS the configured `test_command`, used as the runtime harness)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 14 |
| Tasks complete | 14 |
| Tasks incomplete | 0 |

All 14 tasks from `openspec/changes/pipeline-smoke-test/tasks.md` are checked. Full verification is unblocked.

### Build & Tests Execution

**Build**: ➖ Not applicable — `openspec/config.yaml` `verify.build_command: ""`; bash+JSON project has no build step. Coverage tooling absent (`coverage_threshold: 0`).

**Tests**: ✅ `scripts/smoke-test.sh` clean run — exit code 0 (all 5 steps passed)

```text
$ ./scripts/smoke-test.sh
==> 1: sintaxis de scripts y preparación del sandbox
==> 2: extracción de texto de un PDF con capa de texto (pdftotext)
PDF generado: inputs/menu-texto.pdf 646 bytes
[OK] Extraído con: pdftotext
[OK] Guardado en: data-json/menu-texto.json
envelope pdftotext OK
==> 3: extracción de texto de una imagen PNG (tesseract)
PNG generado: inputs/menu-imagen.png 366 bytes
[INFO] Imagen detectada, usando OCR...
[OK] Extraído con: tesseract
[OK] Guardado en: data-json/menu-imagen.json
envelope tesseract OK
==> 4: conversión del fixture de reporte a docx
[OK] Espaciado aplicado a 3 párrafos de lista
[OK] Convertido: reportsDocx/fixture-report.docx
==> 5: validación del docx generado
docx válido; w:after="160" x3

[OK] Smoke test del pipeline completado
```
Exit code: 0. Output digest `sha256:e7ff28a0d9ba5f0362e871753b4abe1c271dd33bf909adfeca2bfcd1f4891cbe`.

**RED spot-checks reproduced by verifier** (all exit non-zero, failing step named, sandbox removed):

| RED | Injection | Verifier result |
|-----|-----------|-----------------|
| Spacing (apply 4.4) | fixture cut to 2 bold list items | exit 1; `w:after="160" x2, se esperaba 3`; `[ERROR] Fallo en el paso: 5: validación del docx generado`; no `.smoke-test.*` leftover |
| Syntax (apply 4.2) | `scripts/.__red.sh` with unterminated quote | exit 2; `scripts/.__red.sh: line 2: unexpected EOF while looking for matching \`"'`; `[ERROR] Fallo en el paso: 1: sintaxis de scripts y preparación del sandbox` |

Restore after each injection → clean run exit 0. Reproduces the apply-progress RED claims exactly.

**Real data untouched**: `git status --porcelain -- menus data-json reports reportsDocx catalogo-data-base` empty after ALL runs (clean + 3 RED injections). No `.smoke-test.*` leftovers anywhere. `git status --porcelain` fully clean at the end; working tree matches commit `5f1107a`.

**Coverage**: ➖ Not available (no coverage tooling; shell+JSON project, `coverage_threshold: 0`).

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| REQ-01 Sandbox isolation | Real data untouched | smoke-test.sh `mktemp -d "$REPO_ROOT/.smoke-test.XXXXXX"` + `trap cleanup EXIT`; verifier porcelain check | ✅ COMPLIANT |
| REQ-01 Sandbox isolation | Failure cleans up | RED spacing/syntax runs (exit 1/2) → `ls -d .smoke-test.*` empty | ✅ COMPLIANT |
| REQ-02 Shell syntax check | Syntax error caught | `prepare_sandbox` `bash -n` loop runs first; RED repro exit 2 naming `scripts/.__red.sh` | ✅ COMPLIANT |
| REQ-03 Text-layer PDF extraction | pdftotext path asserted | step2: stdlib PDF → `extract-text.sh` → asserts keys + method `pdftotext` + text non-empty ("envelope pdftotext OK") | ✅ COMPLIANT |
| REQ-04 Image (PNG) extraction envelope | tesseract envelope only | step3: stdlib PNG → `extract-text.sh` → asserts keys + method `tesseract`, text unasserted ("envelope tesseract OK") | ✅ COMPLIANT |
| REQ-05 Docx conversion validity | Spacing injection present | step4+5: valid zip, well-formed `word/document.xml`, `w:after="160"` == 3 ("docx válido; w:after=\"160\" x3") | ✅ COMPLIANT |
| REQ-06 Exit-code semantics | Clean tree passes | clean run exit 0 | ✅ COMPLIANT |
| REQ-06 Exit-code semantics | Injected regression fails | RED spacing exit 1, RED syntax exit 2, apply RED 4.3 envelope exit 1 | ✅ COMPLIANT |
| REQ-07 Test command wiring | Phases run it | config.yaml L39 `apply.test_command` + L41 `verify.test_command` = `scripts/smoke-test.sh`; executable; runs and returns exit code | ✅ COMPLIANT |
| REQ-08 Synthetic fixture | Fixture safe to commit | static inspection: fully synthetic content, `grep -c '^- \*\*'` == 3, blank line between entries, AGENTS.md + corrections.md format | ✅ COMPLIANT |
| REQ-09 Declared runtime dependencies only | No new dependencies | command scan: bash, python3, mktemp, pdftotext, tesseract, pandoc only (+ coreutils) | ✅ COMPLIANT |
| REQ-09 Declared runtime dependencies only | POSIX-safe constructs | grep: no `[[ ]]`, no `local`, no process substitution | ✅ COMPLIANT |

**Compliance summary**: 12/12 scenarios compliant.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| REQ-01 Sandbox isolation | ✅ Implemented | `mktemp -d` sandbox under repo root; `trap cleanup EXIT` + `trap 'exit 1' INT TERM`; `rm -rf` on exit incl. failure; `.gitignore` guard `/.smoke-test.*/` for crash leftovers |
| REQ-02 Shell syntax check | ✅ Implemented | Dual-glob for-loop (`*.sh` + `.[!.]*.sh`) runs `bash -n` before any other step; `[ -f ] || continue` POSIX guard |
| REQ-03 Text-layer PDF extraction | ✅ Implemented | Pure-stdlib PDF generator (646 bytes, 73 chars text); asserts `source_file`/`extraction_method`/`text`, method == `pdftotext`, `text` non-empty, `sys.exit(1)` on fail |
| REQ-04 Image (PNG) extraction envelope | ✅ Implemented | Pure-stdlib PNG (zlib/struct, 366 bytes); asserts keys + method == `tesseract` only; text unasserted |
| REQ-05 Docx conversion validity | ✅ Implemented | `convert-report.sh` on committed fixture; python3 asserts readable zip (`testzip`), well-formed XML (`ET.fromstring`), `w:after="160"` count == 3 |
| REQ-06 Exit-code semantics | ✅ Implemented | `set -e` + `set -E` + ERR trap naming failing step; `sys.exit(1)` on assertion failure; INT/TERM → exit 1 |
| REQ-07 Test command wiring | ✅ Implemented | config.yaml L39/L41; script executable (`test -x` OK) and `bash -n` clean |
| REQ-08 Synthetic fixture | ✅ Implemented | Committed + tracked; synthetic Spanish report per AGENTS.md (Resumen/Productos/Sustitutos/Gaps/Pitch) + corrections.md (bold `**Producto (código, empaque)**`, blank line between entries, pitch ≤ 5 lines, no cost/price language); exactly 3 bold list items; no real client/catalog/menu/report data |
| REQ-09 Declared runtime dependencies only | ✅ Implemented | Only bash, python3, pdftotext, tesseract, pandoc (+ coreutils mktemp/cp/ln/cd/rm); no `[[ ]]`, `local`, process substitution |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Sandbox location `mktemp -d "$REPO_ROOT/.smoke-test.XXXXXX"` | ✅ Yes | smoke-test.sh L54; `.gitignore` guard present |
| Cleanup `trap cleanup EXIT` + `trap 'exit 1' INT TERM` | ✅ Yes | L34–35 |
| `cp` scripts/ into sandbox (after `bash -n`) | ✅ Yes | L56–57 (gate first, L49–52) |
| `ln -s` tessdata + templates (read-only) | ✅ Yes | L58–59 |
| `cd "$SANDBOX"` once; CWD-relative outputs | ✅ Yes | L61; outputs land in `$SANDBOX/data-json`, `$SANDBOX/reportsDocx` |
| Distinct input basenames `menu-texto.pdf` / `menu-imagen.png` | ✅ Yes | L66, L123 |
| Spacing assertion `w:after="160"` == 3 | ✅ Yes | L187; verified live |
| Fixture shape: 3 list items (2 Productos + 1 Sustitutos), Gaps/Pitch plain | ✅ Yes | fixture L10/12/16 bold; Gaps/Pitch paragraphs |
| LLM stage not tested (envelope contract IS tested) | ✅ Yes | no `run-analysis.sh` in runner |
| POSIX-safe `step()` with global `STEP_NAME` | ✅ Yes | L38–43 |

Deviation review (from apply-progress): (1) syntax gate extended to hidden `.sh` via dual-glob — superset of design, required to satisfy task 4.2, verified; (2) `set -E` added — required for ERR trap inside functions, verified; (3) RED revert via backup copies instead of `git checkout` (files untracked at the time) — process note, no code impact; (4) 201 lines vs ~150 forecast — under 400-line budget. None break a spec requirement.

### Issues Found

**CRITICAL**: None
**WARNING**: None
**SUGGESTION**:
1. `w:after="160"` assertion is pinned to `== 3` (stricter than the spec's `≥ 1` floor). Correct today (fixture has exactly 3 list items); if the fixture shape ever grows, the count must be updated. Design already documents loosening to `>= 1` only on pandoc drift.
2. Tesseract runs `-l spa+eng --tessdata-dir <project tessdata>`; only `spa.traineddata` is present, so `eng` fails to load and OCR yields empty text (tesseract exits 0). The envelope-only assertion is the correct response — text is unasserted. If OCR text assertions are ever wanted, `tessdata/eng.traineddata` must be added.
3. `set -E` (errtrace) is a bash extension; the spec's forbidden-constructs list is `[[ ]]`/`local`/process substitution, all absent, so this is compliant. Flagging only for strict POSIX-`sh` portability awareness; the script correctly declares `#!/usr/bin/env bash`.
4. RED 4.3/4.4 used backup copies instead of `git checkout` (files were untracked pre-commit). Now that `5f1107a` is committed, future RED repros can use plain `git checkout` restore.

### Verdict

PASS
All 9 requirements / 12 scenarios verified against the live repository: clean run exit 0, both RED classes (syntax + spacing) reproduced non-zero with failing step named and sandbox cleaned, real data dirs untouched, config wiring and README confirmed, fixture synthetic and format-conformant, POSIX-safe constructs and declared deps only.
