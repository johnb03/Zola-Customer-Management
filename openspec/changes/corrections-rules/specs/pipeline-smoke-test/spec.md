# Delta for Pipeline Smoke Test

## ADDED Requirements

### Requirement: Corrections checker regression

The smoke test MUST run `scripts/validate-report.sh` on the committed fixture `test/fixtures/fixture-report.md` (as sandboxed copy) as a step after docx validation, and MUST require the checker to exit 0.

#### Scenario: Fixture passes the checker

- GIVEN committed fixture `test/fixtures/fixture-report.md`
- WHEN the smoke test runs `validate-report.sh` on it
- THEN the checker exits 0
- AND the smoke test continues and exits 0 overall

#### Scenario: Checker regression fails the smoke test

- GIVEN a checker regression that flags the fixture
- WHEN the smoke test runs
- THEN the checker exits non-zero
- AND the smoke test exits non-zero, naming the failing step
