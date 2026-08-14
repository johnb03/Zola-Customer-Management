# Proposal: Pipeline regression smoke test

## Intent

Pipeline (extract-text.sh → run-analysis.sh → convert-report.sh) has no test runner, CI, or linter; only automated check is `bash -n scripts/*.sh`. Regressions in JSON envelope shape, bash syntax, or corrections.md list-spacing go undetected. Add a deterministic, sandboxed smoke test for the non-LLM stages.

## Scope

### In Scope
- `scripts/smoke-test.sh`: bash + inline python3 heredocs (per convert-report.sh); sandboxed (mktemp), <30s, zero new deps, POSIX-safe. Steps: (1) `bash -n` all scripts; (2) extract-text.sh on runtime-generated text-layer PDF (assert method=pdftotext + JSON envelope) and PNG (assert method=tesseract + envelope, never OCR text content); (3) convert-report.sh on fixture MD (assert valid .docx zip, well-formed word/document.xml, ≥1 list-spacing injection `w:after="160"`).
- `test/fixtures/fixture-report.md`: minimal synthetic fixture per AGENTS.md (bold product lines, blank line between entries).
- `openspec/config.yaml`: apply+verify test_command → `scripts/smoke-test.sh`.
- `README.md`: usage note.

### Out of Scope
- LLM analysis execution (non-deterministic; input-contract only).
- CI wiring, pre-commit hooks.
- corrections.md rules as spec domain (follow-up).
- Real menus/catalogs/reports (privacy: synthetic only).

## Capabilities

### New Capabilities
- `pipeline-smoke-test`: smoke test requirements — sandbox isolation, syntax check, extract-method assertions, docx validation, test_command wiring.

### Modified Capabilities
- None.

## Approach

One script, `set -e`, trap cleanup; sandbox copies scripts/templates/tessdata to mktemp so real data dirs stay unpolluted; inline python3 generates fixtures and validates; any failed assertion → non-zero exit. Strict superset of current `bash -n` (step 1).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `scripts/smoke-test.sh` | New | Smoke test runner |
| `test/fixtures/fixture-report.md` | New | Synthetic fixture |
| `openspec/config.yaml` | Modified | test_command (apply+verify) |
| `README.md` | Modified | Usage note |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Fixture drift from AGENTS.md format | Low | Minimal fixture + format comment |
| Tesseract env variance | Med | Assert envelope/method only |
| bash portability | Low | POSIX-safe subset, no `[[ ]]` |
| Real-data exposure | Low | Synthetic fixture; never reads data dirs |

## Rollback Plan

`git revert` of the change commit — additive files + one config line; restores test_command to `bash -n scripts/*.sh`.

## Dependencies

- Runtime deps already required: bash, python3, pdftotext, tesseract, pandoc.

## Success Criteria

- [ ] `scripts/smoke-test.sh` exits 0 on clean tree; non-zero on injected regression (e.g., syntax error, missing envelope key).
- [ ] apply + verify phases run it via config test_command.
- [ ] No gitignored/commercial data touched.

## Proposal question round

Assumptions: run-analysis input-contract only; fixture fully synthetic; ≥1 spacing injection (tolerance); no CI wiring. Review: (1) CI/pre-commit now or later? (2) envelope field-checking sufficient, or pin exact schema?
