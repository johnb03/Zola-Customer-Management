# Tasks: Corrections rules (static checker)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 135-150 (checker ~120, smoke ~13, README ~10) |
| Delivery strategy | ask-on-risk |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Work Units

| Unit | Goal | Test | Harness | Rollback |
|---|---|---|---|---|
| 1 | Planning artifacts | docs review | N/A — docs only | delete openspec/changes/corrections-rules/ |
| 2 | Checker + smoke 6 + README | `./scripts/smoke-test.sh` | sandbox fixture step 6 | rm validate-report.sh; revert smoke-test.sh, README.md |
| 3 | Apply-progress | docs review | N/A — progress doc | remove apply-progress.md |

## Phase 1: Core — validate-report.sh

- [x] 1.1 Create `scripts/validate-report.sh`: bash wrapper `set -e`, quoted `python3 - "$MD_FILE" <<'PYEOF'` heredoc (convert-report.sh pattern), missing/unreadable arg → exit 2 stderr, exit 0/1/2, `chmod +x`. Files: scripts/validate-report.sh. Dep: —. ~25 lines. AC: `bash -n` clean; no-arg → exit 2.
- [x] 1.2 Implement BOLD, SPACING, PITCH, BAN, MARKS (design.md:21-39): BOLD in both list sections (starts `**`; next `**` followed by ` —`; none after), SPACING ≥1 blank between consecutive `- ` lines (prints both), PITCH `## Pitch sugerido`→EOF >5 non-empty → first, BAN strip `ALLOWED_RE` then scan `BAN_RE` (design.md:33-39, `re.I`), MARKS exactly one mark per Productos `- **` line; never SALSA/MARKS-JUDGMENT. Files: scripts/validate-report.sh. Dep: 1.1. ~90 lines. AC: fixture-report.md → exit 0, no output.
- [x] 1.3 Privacy output: deduped ids only (`BOLD <n>` `SPACING <a>,<b>` `PITCH <n>` `BAN <n>` `MARKS <n>`), regex `^[A-Z]+( \d+(,\d+)?)?$`; no content/names. Files: scripts/validate-report.sh. Dep: 1.2. ~10 lines. AC: output matches regex exclusively.

## Phase 2: Integration — smoke step 6 + README

- [x] 2.1 Add `step6_checker()` + `step "6: ..."` to `scripts/smoke-test.sh`: run `"$SANDBOX/scripts/validate-report.sh" reports/fixture-report.md`, require exit 0; `STEP_NAME` feeds ERR trap; update header. Files: scripts/smoke-test.sh. Dep: 1.2. ~13 lines. AC: smoke exits 0; forced regression → non-zero naming step 6.
- [x] 2.2 README.md Verificación note (Spanish): usage, exit codes 0/1/2, ids-only output, on-demand gate. Files: README.md. Dep: 1.1. ~10 lines. AC: note in Spanish; no gitignored data referenced.

## Phase 3: Verification

- [x] 3.1 Syntax: smoke step-1 glob runs `bash -n` on `scripts/*.sh` incl. validate-report.sh. Dep: 1.1.
- [x] 3.2 Regression: `./scripts/smoke-test.sh` exits 0 incl. step 6 (scen. 1-2). Dep: 2.1.
- [x] 3.3 Negative, one adversarial report per class → id+line, exit 1: BOLD unbolded; SPACING adjacent (both lines); PITCH 6 non-empty; BAN "precio de mayoreo"; MARKS missing. Dep: 1.2.
- [x] 3.4 Threat (design.md:82): report with `` `whoami` `` / `$(...)` → exit 0, no execution (open() only). Dep: 1.2.
- [x] 3.5 Exit-2 usage: no arg / nonexistent file → exit 2, stderr only. Dep: 1.1.

## Phase 4: Commits (work units)

- [x] 4.1 `chore(openspec): add corrections-rules planning artifacts` — proposal.md, specs/, design.md, tasks.md. Dep: —.
- [x] 4.2 `feat(corrections): add static report validator` — validate-report.sh, smoke-test.sh, README.md (tests+docs with code). Dep: 2.1, 2.2, 3.2.
- [x] 4.3 `chore(openspec): record corrections-rules apply progress` — apply-progress.md. Dep: 4.2.
