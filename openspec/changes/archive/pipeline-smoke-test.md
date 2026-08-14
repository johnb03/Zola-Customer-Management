# Archive Report: pipeline-smoke-test

**Archived**: 2026-08-14
**Archived to**: `openspec/changes/archive/2026-08-14-pipeline-smoke-test/`
**Repo**: ClienteListo (branch `main`)
**Mode**: hybrid (OpenSpec + Engram)

## Summary

Added a deterministic, sandboxed regression smoke test (`scripts/smoke-test.sh`) for the
non-LLM pipeline stages: shell syntax gate, text-layer PDF extraction (pdftotext),
PNG extraction envelope (tesseract), and docx conversion validity — all inside a
`mktemp` sandbox that is removed on success and failure. Added synthetic fixture
`test/fixtures/fixture-report.md`, wired `apply.test_command`/`verify.test_command` to the
runner in `openspec/config.yaml`, added a README verification note, and a `.gitignore`
crash-leftover guard. Real data directories (`menus/`, `data-json/`, `reports/`,
`reportsDocx/`, `catalogo-data-base/`) are never touched.

## Final State (at close)

- **Verify verdict**: **PASS** — 9/9 requirements, 12/12 scenarios; CRITICAL 0, WARNING 0, SUGGESTION 4.
- `scripts/smoke-test.sh` clean run exit 0 at HEAD `1f94f84` (all 5 steps passed).
- Real data dirs untouched (`git status --porcelain` on them empty after all runs); no `.smoke-test.*` sandbox leftovers.
- Tasks: 14/14 complete.
- No review transaction was opened for this change (no `reviews/` artifacts exist anywhere in the repo); the verification terminal receipt (`gentle-ai.verify-result/v1`, verdict `pass`, `critical_findings: 0`, `blockers: 0`) is the gate evidence.

## Commits

| Commit | Type | Content |
|--------|------|---------|
| `893a03b` | chore(openspec) | pipeline-smoke-test planning artifacts (proposal, design, tasks, main spec) |
| `5f1107a` | feat(smoke) | sandboxed pipeline regression smoke test (runner, fixture, config wiring, README, gitignore) |
| `1f94f84` | chore(openspec) | apply progress |
| *(this commit)* | chore(openspec) | archive: verify report + archive report + folder move |

## Spec Sync

No delta spec merge was required: the change had no `openspec/changes/pipeline-smoke-test/specs/`
delta folder — the spec was written directly to the main spec
`openspec/specs/pipeline-smoke-test/spec.md` in commit `893a03b`. Content was re-verified
against the verification evidence: 9 requirements / 12 scenarios, matching
`verify-report` (`requirements: 9/9`, `scenarios: 12/12`). No additions, modifications,
or removals needed at archive time.

## Non-Blocking Suggestions (from verification, all documented at verification time)

1. `w:after="160"` assertion pinned to `== 3` (stricter than the spec's `>= 1` floor). Correct today (fixture has exactly 3 list items); update if fixture shape grows. Design already documents loosening to `>= 1` only on pandoc drift.
2. Tesseract runs `-l spa+eng --tessdata-dir <project tessdata>`; only `spa.traineddata` is present, so `eng` fails to load and OCR yields empty text (tesseract exits 0). The envelope-only assertion is the correct response — text is unasserted. Add `tessdata/eng.traineddata` only if OCR text assertions are ever wanted.
3. `set -E` (errtrace) is a bash extension; the spec's forbidden-constructs list (`[[ ]]`, `local`, process substitution) is all absent, so this is compliant. Flagged only for strict POSIX-`sh` portability awareness; the script correctly declares `#!/usr/bin/env bash`.
4. RED 4.3/4.4 used backup copies instead of `git checkout` (files were untracked pre-commit). Now that `5f1107a` is committed, future RED reproductions can use plain `git checkout` restore.

## Rollback Boundary

`git revert 5f1107a` restores `test_command` to `bash -n scripts/*.sh` and removes the
additive files (`scripts/smoke-test.sh`, `test/fixtures/`), plus reverts the `.gitignore`
guard and the 2 config lines. Planning-artifacts commit `893a03b` is untouched.

## Follow-ups (explicitly NOT part of this change)

- corrections.md rules as a spec domain (proposal out-of-scope item).
- tesseract `eng.traineddata` if OCR text assertions are ever wanted.
- Loosening `w:after` assertion to `>= 1` on pandoc drift.

## Traceability

| Artifact | Path / Engram observation |
|----------|---------------------------|
| Proposal | `openspec/changes/archive/2026-08-14-pipeline-smoke-test/proposal.md` / Engram #115 (`sdd/pipeline-smoke-test/proposal`) |
| Spec (main) | `openspec/specs/pipeline-smoke-test/spec.md` / Engram #116 (`sdd/pipeline-smoke-test/spec`) |
| Discovery (empirical verification) | Engram #117 |
| Design | `openspec/changes/archive/2026-08-14-pipeline-smoke-test/design.md` / Engram #118 (`sdd/pipeline-smoke-test/design`) |
| Tasks | `openspec/changes/archive/2026-08-14-pipeline-smoke-test/tasks.md` (14/14 `[x]`) / Engram #120 (`sdd/pipeline-smoke-test/tasks`) |
| Apply progress | `openspec/changes/archive/2026-08-14-pipeline-smoke-test/apply-progress.md` / Engram #121 (`sdd/pipeline-smoke-test/apply-progress`) |
| Verify report | `openspec/changes/archive/2026-08-14-pipeline-smoke-test/verify-report.md` / Engram #122 (`sdd/pipeline-smoke-test/verify-report`) |
| Archive report | `openspec/changes/archive/pipeline-smoke-test.md` / Engram (`sdd/pipeline-smoke-test/archive-report`) |

## Compliance Notes

- Task Completion Gate: all 14 tasks checked; archived `tasks.md` has no unchecked implementation tasks.
- Native status (`gentle-ai sdd-status`): `blockedReasons: []`; `applyProgress`/`design`/`proposal`/`tasks`/`verifyReport` all `done`. (`specs: []` and `nextRecommended: spec` are a dispatcher artifact of the no-delta layout — the spec lives in main specs since `893a03b`; it does not represent a pending planning phase. Dispatcher cannot see the untracked `verify-report.md`.)
- No destructive spec merge performed; `rules.archive` ("warn before merging destructive deltas") not triggered.
- No gitignored/commercial data exposed in this artifact.
