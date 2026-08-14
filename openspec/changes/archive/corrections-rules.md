# Archive Report: corrections-rules

**Archived**: 2026-08-14
**Archived to**: `openspec/changes/archive/2026-08-14-corrections-rules/`
**Repo**: ClienteListo (branch `main`)
**Mode**: hybrid (OpenSpec + Engram)

## Summary

Formalized the always-on `corrections.md` rules as a new OpenSpec domain `corrections`
(9 requirements / 14 scenarios) and added a static checker `scripts/validate-report.sh`
(bash wrapper + python3 heredoc) for the mechanical subset: bold format, blank-line
separation, pitch <= 5 lines, word bans with the work-saving exception, and exactly-one
explicitness mark per "Productos a ofrecer" entry. The checker prints rule ids + line
numbers only and exits 0/1/2. Semantic rules (salsa de tomate no-match, marking judgment)
stay manual/golden by design — never checked. `scripts/smoke-test.sh` gained step 6
running the checker on the sandboxed fixture (must exit 0), and README gained a Spanish
verification note. No gitignored commercial data is referenced anywhere in this change.

## Final State (at close)

- **Verify verdict**: **PASS** — 10/10 requirements, 16/16 scenarios (14 corrections + 2 pipeline-smoke-test delta); CRITICAL 0, WARNING 0, SUGGESTION 3 — none blocking. No post-verify fixes were made.
- **Tasks**: 13/13 complete (`tasks.md` authoritative; `apply-progress.md:6` header reads "12/12" — stale count, see Suggestion 1).
- **Ledger** (native `gentle-ai sdd-attempt status`): verify attempt (ordinal 2) finished `passed`; `complete: true`, `next_action: complete`, `decision_required: false`; evidence_revision `sha256:078d4687323913e4eff3f63c6e1bd2ee1812ee1a741c2fcba987345033f8dad7` matches the verify report envelope.
- **Verify report**: natively validated at archive time via `gentle-ai sdd-verify-validate --input ... --requirements 10 --scenarios 16` -> `{valid: true, verdict: "pass", evidence_revision: sha256:078d4687...dad7}`; sha256 of the file `70750b8545d8cf652a396cc3f02e9a0bb86510de746b855fd1b6587e85442f3a`.
- Smoke test exits 0 including step 6; `bash -n scripts/*.sh` clean (all 6 scripts); adversarial matrix (BOLD, SPACING, PITCH, BAN, MARKS, usage/exit codes, privacy, threat model) green.
- Real data dirs untouched; no `.smoke-test.*` leftovers; `git status --porcelain` clean after the archive commit.

## Commits

| Commit | Type | Content |
|--------|------|---------|
| `61b0620` | chore(openspec) | corrections-rules planning artifacts (proposal, specs, design, tasks) |
| `2f38fef` | feat(corrections) | static report validator (`validate-report.sh` 132 lines, smoke step 6, README note) |
| `8d09caa` | chore(openspec) | apply progress |
| *(this commit)* | chore(openspec) | archive: verify report + archive report + spec sync + folder move |

## Spec Sync

| Domain | Action | Details |
|--------|--------|---------|
| `corrections` | Created | `openspec/specs/corrections/spec.md` — new domain, full spec from the delta (9 requirements / 14 scenarios), byte-identical to the archived delta |
| `pipeline-smoke-test` | Updated | `openspec/specs/pipeline-smoke-test/spec.md` — appended ADDED requirement "Corrections checker regression" + 2 scenarios to the existing requirements list (9 -> 10 requirements, 12 -> 14 scenarios). All other requirements preserved verbatim |

Delta-scenario totals reconcile with the verify report: 14 corrections + 2 pipeline-smoke-test = 16 scenarios; 9 + 1 = 10 requirements.

## Review Gate Note (project convention)

No review transaction was opened for this change — consistent with the project precedent
(`pipeline-smoke-test` archive report: "No review transaction was opened for this change
(no `reviews/` artifacts exist anywhere in the repo); the verification terminal receipt is
the gate evidence"). Verified at archive time:

- `gentle-ai review status` -> `complete: true, authoritative: true, status: "clean"`, `entries: []`, `locks: []` — zero review authority state in this repository.
- No review policy files, no `reviews/` artifacts, and no review commits exist anywhere in the repo.
- Native `gentle-ai sdd-status` reports `reviewGate: {result: "invalidated"}` with `blockedReasons: ["terminal review receipt is missing; run the fresh full review of the current state with gentle-ai review start"]` and `nextRecommended: resolve-review` — the dispatcher's default projection for a change in a project that never opens review transactions, not evidence of a failed review.
- The orchestrator forwarded, and the native attempt ledger corroborates: verify attempt finished `passed`, `next_action: complete`.
- The strict verify terminal receipt (`gentle-ai.verify-result/v1`, verdict `pass`, `critical_findings: 0`, `blockers: 0`, natively validated `valid: true` with evidence_revision matching the ledger) is the gate evidence for this project, per precedent. Archive proceeded on that basis under explicit orchestrator instruction.

## Non-Blocking Suggestions (from verification — all recorded, no code changes made)

1. `apply-progress.md:6` header reads "Status: 12/12 tasks complete" — stale count; the authoritative `tasks.md` holds 13 tasks, all complete (grep at archive time: 13 checked, 0 unchecked). Per orchestrator final-state facts, the snapshot is left as-is and this is recorded in the archive. No functional impact.
2. `design.md:82` threat-table RED line "`$(...)` in report -> exit 0" is literally unreachable: `BAN_RE` includes `\$`, so a `$(...)` report exits 1 with `BAN <n>` (correct — `$500` must be flagged). The security property (open() only, no eval/shell, zero side effects) is independently verified: backtick-only report exits 0, `$(touch ...)` produces no side effect. Documented behavior = `BAN <n>` exit 1; no code change (checker not loosened; "adjust fixture, never loosen checker").
3. BAN word-boundary matching (design.md:13) leaves plural/suffixed forms mechanically unflagged ("precios", "descuentos", "costos") while flagging the exact spec-listed tokens ("precio de mayoreo" -> flagged). Documented tradeoff: boundary avoids "apreciamos"/"peso" false positives. Optional future enhancement: `precios?|descuentos?|costos?` alternates if corrections.md's "ningún término de costo" must be enforced mechanically.

## Rollback Boundary

`git revert 2f38fef` removes `scripts/validate-report.sh`, the smoke step 6, and the README
note (additive files). The spec sync + folder move are OpenSpec metadata only; reverting the
archive commit restores the change folder and removes the main-spec additions. Planning
artifacts commit `61b0620` is untouched.

## Follow-ups (explicitly NOT part of this change)

- LLM self-check of semantic rules (salsa de tomate, marking judgment) — deferred by design (manual/golden).
- Optional BAN plural alternates (`precios?|descuentos?|costos?`) if mechanical enforcement of "ningún término de costo" is ever required.
- Optional reword of `design.md:82` threat line for future readers (unreachable RED).

## Traceability

| Artifact | Path / Engram observation |
|----------|---------------------------|
| Exploration | Engram #125 (`sdd/explore/corrections-rules`) |
| Proposal | `openspec/changes/archive/2026-08-14-corrections-rules/proposal.md` / Engram #126 (`sdd/corrections-rules/proposal`) |
| Spec (delta) | `openspec/changes/archive/2026-08-14-corrections-rules/specs/` / Engram #127 (`sdd/corrections-rules/spec`) |
| Design | `openspec/changes/archive/2026-08-14-corrections-rules/design.md` / Engram #128 (`sdd/corrections-rules/design`) |
| Tasks | `openspec/changes/archive/2026-08-14-corrections-rules/tasks.md` (13/13 `[x]`) |
| Apply progress | `openspec/changes/archive/2026-08-14-corrections-rules/apply-progress.md` / Engram #130 (`sdd/corrections-rules/apply-progress`) |
| Verify report | `openspec/changes/archive/2026-08-14-corrections-rules/verify-report.md` / Engram #131 (`sdd/corrections-rules/verify-report`) |
| Archive report | `openspec/changes/archive/corrections-rules.md` / Engram (`sdd/corrections-rules/archive-report`) |

## Compliance Notes

- Task Completion Gate: 13/13 tasks checked in the persisted `tasks.md`; archived `tasks.md` has no unchecked implementation tasks.
- Native review authority: `gentle-ai review status` authoritative `clean` (zero entries, zero locks) — no review transaction exists in this project; verify terminal receipt is the gate evidence per precedent (see Review Gate Note).
- `rules.archive` ("warn before merging destructive deltas"): no destructive merge performed — one new domain created, one additive requirement appended.
- No gitignored/commercial data exposed in this artifact or any staged file.
