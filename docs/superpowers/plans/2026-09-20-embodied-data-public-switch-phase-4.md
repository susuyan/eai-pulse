# Embodied Data Public Switch Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make relevance, readiness, quality evaluation, collection operations, and Scout enforce the embodied-data production boundary before any public-site switch.

**Architecture:** Apply a layered gate: deterministic relevance first, schema/evidence readiness second, and quality policy last. All gates return typed reason codes and operate on the same explicit evaluation context. Scout consumes only published, ready, embodied Events and can publish only evidence-bound production opportunities. Workflows restore the versioned snapshot and enforce the same rules as local checks.

**Tech Stack:** TypeScript, Zod, Kysely, SQLite, Vitest, GitHub Actions, jq, npm.

**Spec:** `docs/superpowers/specs/2026-09-20-embodied-data-public-switch-design.md`

## Global Constraints

- Do not loosen evidence, SSRF, privacy, source lifecycle, evaluation-time, or audit controls.
- A keyword match is never sufficient for inclusion.
- Generic AI leakage is an absolute failure, not a weighted score.
- Publisher claims remain distinct from independent verification and conflicts.
- New Sources remain `shadow`; no task may bypass observation or contract history.
- Workflow output contains public-safe scores, counts, reason codes, URLs, and Actions links only.
- Use a fixed `EvaluationContext` in tests and change gates. Use current time only for operational checks.
- Each task follows red-green-refactor and ends in a reviewable commit.

## Review Focus

- Negative examples include Turing tests, generic multimodal Agents, generic VLA/control papers, and robot financing without data-production impact.
- Missing DataProfile, stage, track, Evidence, or safe source URL blocks publication.
- Capability claims cannot become independently verified because the Actor exists or has a high authority score.
- Data refresh never collects retired generic-AI sources, never advances a failed cursor, and never destabilizes the curated launch corpus.
- Scout cannot publish a suggestion whose trigger Event is review-only, legacy, expired, or missing public Evidence.

---

### Task 1: Upgrade the Relevance Gate and Golden Sets

**Files:**

- Modify: `src/domain/embodied-data-relevance.ts`
- Modify: `tests/fixtures/embodied-data/relevance-cases.json`
- Modify: `tests/embodied-data-relevance.test.ts`
- Modify: `src/pipeline/embodied-data-preview.ts`

**Interfaces:**

- Produces: `assessEmbodiedDataRelevance(candidate)` with `include | review | reject`, matched stages, and stable reason codes.
- Requires both an embodiment anchor and a direct data-production impact.

- [ ] **Step 1: Add failing positive, boundary, and negative golden cases**

Include at least 12 positive, 8 review, and 12 reject cases. Required rejects: Turing-test result, generic multimodal Agent, generic VLA architecture, robot fundraising, control-only paper, perception-only benchmark, and a dataset claim with no original source.

- [ ] **Step 2: Run the focused test and observe RED**

```bash
npm test -- --run tests/embodied-data-relevance.test.ts
```

- [ ] **Step 3: Implement two-level deterministic assessment**

Return separate `embodimentAnchor` and `productionImpact` evidence. Use explicit positive and negative rules; avoid a single weighted keyword score. Keep uncertain cases in `review`.

- [ ] **Step 4: Verify the private preview remains non-authoritative**

Preview output may display recommendations but must not mutate scope, status, DataProfile, snapshot, or `dist/`.

- [ ] **Step 5: Commit**

```bash
npm test -- --run tests/embodied-data-relevance.test.ts tests/embodied-data-preview.test.ts
git add src/domain/embodied-data-relevance.ts src/pipeline/embodied-data-preview.ts tests/embodied-data-relevance.test.ts tests/fixtures/embodied-data/relevance-cases.json
git commit -m "feat: enforce embodied data relevance"
```

---

### Task 2: Enforce Event and Domain-Object Readiness

**Files:**

- Modify: `src/pipeline/readiness.ts`
- Create: `src/pipeline/embodied-data-object-readiness.ts`
- Modify: `src/cli/auto-publish.ts`
- Modify: `tests/readiness.test.ts`
- Create: `tests/embodied-data-object-readiness.test.ts`

**Interfaces:**

- Extends `ReadinessBlocker` with embodied scope, profile, pipeline stage, track, and evidence blockers.
- Produces: `evaluateDomainObjectReadiness(record, relations, evidence)`.

- [ ] **Step 1: Write failing hard-gate tests**

Cover missing/legacy scope, invalid DataProfile, no pipeline stage, no track, insufficient independent evidence, unsafe URL, unsourced numeric claim, unlinked capability, and false independent-verification status.

- [ ] **Step 2: Run focused tests and observe RED**

```bash
npm test -- --run tests/readiness.test.ts tests/embodied-data-object-readiness.test.ts
```

- [ ] **Step 3: Implement Event readiness on joined evidence**

Read the Event, DataProfile, EventTrack, and Evidence records in one evaluation path. Do not trust denormalized text or Actor identity as proof.

- [ ] **Step 4: Implement reusable-object readiness**

Dataset, Standard, and CollectionMethod require a canonical source plus time/version boundary. Every sourced metric requires its own URL. ActorDataCapability requires relation evidence and status-consistent claimant metadata.

- [ ] **Step 5: Make auto-publish fail closed**

Only Events that pass relevance and readiness can become `published`. Persist blocker reason codes for rejected candidates; never replace them with empty insight text.

- [ ] **Step 6: Commit**

```bash
npm test -- --run tests/readiness.test.ts tests/embodied-data-object-readiness.test.ts tests/auto-publish.test.ts
npm run typecheck
git add src/pipeline/readiness.ts src/pipeline/embodied-data-object-readiness.ts src/cli/auto-publish.ts tests/readiness.test.ts tests/embodied-data-object-readiness.test.ts
git commit -m "feat: gate embodied public objects"
```

---

### Task 3: Add Embodied Quality Metrics and the Absolute Leak Gate

**Files:**

- Create: `src/pipeline/embodied-data-quality.ts`
- Modify: `src/pipeline/evaluate.ts`
- Modify: `src/pipeline/evaluation-progress.ts`
- Modify: `src/cli/evaluate.ts`
- Create: `tests/embodied-data-quality.test.ts`
- Modify: `tests/evaluate.test.ts`

**Interfaces:**

- Produces metrics: stage coverage, Tier 1 evidence ratio, DataProfile completeness, peer-claim evidence ratio, and generic-AI leak count.
- Produces reason codes including `missing_stage_coverage`, `insufficient_tier1_evidence`, `incomplete_data_profile`, `unsupported_peer_claim`, and `generic_ai_leak`.

- [ ] **Step 1: Write failing metric and policy tests**

Use fixed evaluation time. Assert six-stage coverage is measured from ready public Events; claimed capability evidence does not count as independent verification; one generic-AI leak fails the gate even if every weighted score is 100.

- [ ] **Step 2: Run focused tests and observe RED**

```bash
npm test -- --run tests/embodied-data-quality.test.ts tests/evaluate.test.ts
```

- [ ] **Step 3: Implement pure metric calculation**

Keep metric calculation independent from persistence. Return numerator, denominator, score, status, evidence age, and reason codes for each dimension.

- [ ] **Step 4: Integrate with versioned evaluation reports**

Extend the current report schema additively. Preserve read compatibility for the previous report version and include `evaluationAsOf` and `gateMode`.

- [ ] **Step 5: Add CLI summaries and failure semantics**

Change gates compare at the baseline time. Operational gates use current time. Both fail immediately on `generic_ai_leak > 0`.

- [ ] **Step 6: Commit**

```bash
npm test -- --run tests/embodied-data-quality.test.ts tests/evaluate.test.ts tests/evaluation-progress.test.ts tests/evaluation-time.test.ts
npm run typecheck
git add src/pipeline/embodied-data-quality.ts src/pipeline/evaluate.ts src/pipeline/evaluation-progress.ts src/cli/evaluate.ts tests/embodied-data-quality.test.ts tests/evaluate.test.ts
git commit -m "feat: measure embodied data quality"
```

---

### Task 4: Replace Generic Scout with Embodied Production Opportunities

**Files:**

- Modify: `src/pipeline/scout.ts`
- Modify: `src/db/seed.ts`
- Modify: `tests/scout.test.ts`
- Create: `tests/embodied-data-scout.test.ts`

**Interfaces:**

- Replaces generic kinds with `collection-route`, `capture-system`, `production-operations`, `data-standard`, `quality-feedback`, and `peer-opportunity`.
- Every published card includes target user, why now, non-consensus point, artifact, first experiment, risk, invalidation condition, and Event/Evidence references.

- [ ] **Step 1: Write failing taxonomy and publication tests**

Assert all six kinds can be produced from isolated fixtures. Reject legacy Events, review-only Events, Events without readiness, expired evidence, generic opportunities, and duplicate cooldown keys.

- [ ] **Step 2: Run focused tests and observe RED**

```bash
npm test -- --run tests/scout.test.ts tests/embodied-data-scout.test.ts
```

- [ ] **Step 3: Implement the embodied taxonomy and card builder**

Use pipeline stages and DataProfile fields to choose a kind. Keep templates bounded and evidence-linked; do not turn capability claims into facts.

- [ ] **Step 4: Replace the seeded generic Scout rows**

Archive legacy Scout rows and seed at least six reviewable embodied opportunities across different kinds. Only publish those whose trigger Events and Evidence pass all gates.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- --run tests/scout.test.ts tests/embodied-data-scout.test.ts tests/weekly-brief.test.ts
npm run typecheck
git add src/pipeline/scout.ts src/db/seed.ts tests/scout.test.ts tests/embodied-data-scout.test.ts
git commit -m "feat: focus scout on embodied data production"
```

---

### Task 5: Align Refresh, Audit, Quality, and Monitor Workflows

**Files:**

- Modify: `.github/workflows/data-refresh.yml`
- Modify: `.github/workflows/source-audit.yml`
- Modify: `.github/workflows/quality-guard.yml`
- Modify: `.github/workflows/monitor.yml`
- Modify: `tests/workflows/source-governance.test.ts`
- Modify: `tests/workflows/evaluation-recovery.test.ts`
- Modify: `tests/pipeline/monitor.test.ts`
- Modify: `tests/monitor-freshness.test.ts`

**Interfaces:**

- Workflows restore the snapshot, run embodied-only collection selection, preserve cursor-on-failure, evaluate leak count, and publish only public-safe summaries.

- [ ] **Step 1: Write failing workflow contract tests**

Assert:

- data-refresh cannot select `legacy-ai` or `retired` sources;
- source-audit reports shadow health without promoting it;
- quality-guard checks the absolute leak gate;
- monitor reports source/audit/evaluation freshness using versioned timestamps;
- only data-refresh may persist a new operational evaluation after a successful real refresh;
- no workflow enables an automatic schedule in this change.

- [ ] **Step 2: Run focused tests and observe RED**

```bash
npm test -- --run tests/workflows/source-governance.test.ts tests/workflows/evaluation-recovery.test.ts tests/pipeline/monitor.test.ts tests/monitor-freshness.test.ts
```

- [ ] **Step 3: Update workflow commands and safe summaries**

Keep manual dispatch. Use `--repo susuyan/eai-pulse` in documented operator commands because `gh` resolves the upstream remote by default in this checkout.

- [ ] **Step 4: Verify bounded failure recovery**

Add cases for one source failure, cursor preservation, no duplicate refresh dispatch, shadow non-promotion, and an unchanged launch corpus after a failed collector.

- [ ] **Step 5: Run Phase 4 exit checks**

```bash
npm test -- --run tests/embodied-data-relevance.test.ts tests/readiness.test.ts tests/embodied-data-object-readiness.test.ts tests/embodied-data-quality.test.ts tests/embodied-data-scout.test.ts tests/workflows/source-governance.test.ts tests/workflows/evaluation-recovery.test.ts tests/pipeline/monitor.test.ts tests/monitor-freshness.test.ts
npm run typecheck
git diff --check
```

- [ ] **Step 6: Commit Phase 4**

```bash
git add .github/workflows/data-refresh.yml .github/workflows/source-audit.yml .github/workflows/quality-guard.yml .github/workflows/monitor.yml tests/workflows/source-governance.test.ts tests/workflows/evaluation-recovery.test.ts tests/pipeline/monitor.test.ts tests/monitor-freshness.test.ts
git commit -m "feat: enforce embodied operations gates"
```
