# Proposal: Corrections rules (spec + static checker)

## Intent

corrections.md rules are never mechanically enforced; LLM output is non-deterministic. Formalize them as OpenSpec domain `corrections` + static checker for the mechanical subset (format, word bans, marks); semantics stay manual/golden.

## Scope

### In Scope
- Delta `specs/corrections/spec.md`: requirement + scenario per corrections.md rule; drift guard both directions.
- New `scripts/validate-report.sh` (~150 lines, bash + python3 heredoc): bold format in both list sections; blank line between entries; pitch ≤ 5 lines; word bans {precio, mayoreo, descuento, costo, $, pesos, barato, ahorro} allowing "ahorro de trabajo"; (explícito)/(inferido) per "Productos a ofrecer" line. Prints rule id + line numbers only.
- `scripts/smoke-test.sh` step 6: validate-report.sh on the fixture (must pass).
- `README.md` usage note.

### Out of Scope
- `run-analysis.sh`, `openspec/config.yaml` unchanged.
- Semantic rules (salsa de tomate, marking judgment): manual golden only.
- LLM self-check (approach 3) deferred.

## Capabilities

### New Capabilities
- `corrections`: corrections.md rules as requirements + scenarios; drift guard.

### Modified Capabilities
- `pipeline-smoke-test`: ADDED — smoke test MUST run validate-report.sh on the fixture.

## Approach

Approach B (#125): python3-heredoc checker over report `.md`, emitting rule id + line numbers only. On-demand gate for real gitignored reports + smoke-test fixture regression; semantics manual/golden.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/changes/corrections-rules/specs/corrections/spec.md` | New | corrections delta spec |
| `scripts/validate-report.sh` | New | static checker (~150 lines) |
| `scripts/smoke-test.sh` | Modified | + step 6 fixture validation |
| `README.md` | Modified | usage note |
| `test/fixtures/fixture-report.md` | Unchanged* | *adjust only if flagged |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| corrections.md ↔ spec drift | Med | drift-guard requirement |
| Word-ban false positives | Med | allow-list heuristic; fixture regression |
| Local-only, no CI | High | smoke step 6; README note |
| Semantic violations uncaught | High | manual/golden by design |

## Rollback Plan

Revert smoke step 6, delete validate-report.sh, remove change folder + README note. corrections.md untouched.

## Dependencies

- bash + python3 (declared runtime deps); corrections.md (committed) as domain source.

## Success Criteria

- [ ] Smoke test exits 0 with step 6; `bash -n` clean.
- [ ] Checker flags each violation class (bold, spacing, pitch > 5, banned word, missing mark).
- [ ] Drift passes both directions; no gitignored data exposed.

## Proposal question round

Assumptions needing review:
1. Checker on-demand only; not wired into run-analysis.sh/convert-report.sh.
2. Marks on "Productos a ofrecer" lines only.
3. pipeline-smoke-test small delta (step 6) vs folding into corrections spec.
4. Word bans exact tokens; "ahorro de trabajo" allowed; adjust fixture, never loosen checker.
