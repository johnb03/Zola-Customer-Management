# Pipeline Smoke Test Specification

## Purpose

Deterministic, sandboxed regression smoke test for the non-LLM pipeline stages (`extract-text.sh`, `convert-report.sh`, shell syntax). Guards JSON envelope shape, `.docx` list-spacing injection, and bash syntax; runs via configured `test_command`; never touches real data directories.

## Requirements

### Requirement: Sandbox isolation

The smoke test MUST run in a temporary `mktemp` sandbox; MUST NOT touch `menus/`, `data-json/`, `reports/`, `reportsDocx/`, `catalogo-data-base/`; and MUST remove the sandbox on exit, including failures.

#### Scenario: Real data untouched

- GIVEN a clean repository tree
- WHEN the smoke test completes
- THEN no real data-directory file is created, modified, or removed
- AND the sandbox is removed

#### Scenario: Failure cleans up

- GIVEN a failing assertion
- WHEN the smoke test runs
- THEN it exits non-zero
- AND the sandbox is removed

### Requirement: Shell syntax check

The smoke test MUST run `bash -n` on every `scripts/*.sh` before any other step.

#### Scenario: Syntax error caught

- GIVEN a script in `scripts/` with a syntax error
- WHEN the smoke test runs
- THEN it exits non-zero, naming the script

### Requirement: Text-layer PDF extraction

For a runtime-generated text-layer PDF, the smoke test MUST run `scripts/extract-text.sh` and assert: keys `source_file`, `extraction_method`, `text` present; `extraction_method` equals `"pdftotext"`; `text` non-empty.

#### Scenario: pdftotext path asserted

- GIVEN a runtime-generated text-layer PDF
- WHEN the smoke test runs `extract-text.sh` on it
- THEN the JSON has keys `source_file`, `extraction_method`, `text`
- AND `extraction_method` equals `"pdftotext"`
- AND `text` is non-empty

### Requirement: Image (PNG) extraction envelope

For a runtime-generated PNG, the smoke test MUST run `scripts/extract-text.sh` and assert only the envelope: keys present and `extraction_method` equals `"tesseract"`; OCR text content is unasserted.

#### Scenario: tesseract envelope only

- GIVEN a runtime-generated PNG
- WHEN the smoke test runs `extract-text.sh` on it
- THEN the JSON has keys `source_file`, `extraction_method`, `text`
- AND `extraction_method` equals `"tesseract"`
- AND `text` content is unasserted

### Requirement: Docx conversion validity

The smoke test MUST run `scripts/convert-report.sh` on committed fixture `test/fixtures/fixture-report.md` and assert: the output `.docx` is a valid zip; `word/document.xml` is well-formed XML; `w:after="160"` occurs at least once.

#### Scenario: Spacing injection present

- GIVEN committed fixture `test/fixtures/fixture-report.md`
- WHEN `convert-report.sh` runs on it
- THEN the output `.docx` is a valid zip
- AND `word/document.xml` is well-formed XML
- AND `w:after="160"` occurs at least once

### Requirement: Exit-code semantics

The smoke test MUST exit 0 when every step passes and non-zero when any step fails.

#### Scenario: Clean tree passes

- GIVEN a clean tree
- WHEN the smoke test runs
- THEN it exits 0

#### Scenario: Injected regression fails

- GIVEN a regression (e.g., missing envelope key)
- WHEN the smoke test runs
- THEN it exits non-zero

### Requirement: Test command wiring

`openspec/config.yaml` MUST set both `apply.test_command` and `verify.test_command` to `scripts/smoke-test.sh`.

#### Scenario: Phases run it

- GIVEN `scripts/smoke-test.sh` is executable
- WHEN the apply or verify phase runs `test_command`
- THEN it executes the smoke test and returns its exit code

### Requirement: Synthetic fixture

`test/fixtures/fixture-report.md` MUST be a committed minimal synthetic report per AGENTS.md format and corrections.md rules (bold product lines, blank line between entries), with no real client, catalog, menu, or report data.

#### Scenario: Fixture safe to commit

- GIVEN the fixture file
- WHEN it is inspected
- THEN it has no real client, catalog, menu, or report data
- AND it has bold product lines with blank lines between entries

### Requirement: Declared runtime dependencies only

The smoke test MUST require only `bash`, `python3`, `pdftotext`, `tesseract`, `pandoc`, and use POSIX-safe bash (no `[[ ]]`, `local`, process substitution).

#### Scenario: No new dependencies

- GIVEN only the declared runtime deps
- WHEN the smoke test runs
- THEN it runs without any additional tool

#### Scenario: POSIX-safe constructs

- WHEN the script is inspected
- THEN it uses only POSIX-safe constructs
