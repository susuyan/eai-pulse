# Evaluation Time Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR evaluation regression checks deterministic at a fixed evidence time while preserving a separate current-time operational gate that alerts and performs one bounded refresh.

**Architecture:** The evaluator receives an explicit `EvaluationContext` and never reads the wall clock while scoring. Versioned schema v2 reports carry `evaluationAsOf` and `gateMode`; PR CI evaluates at the baseline time, while Quality Guard evaluates at the current time and applies absolute policy. Monitor reads the versioned evaluation time instead of checkout file mtime, and both operational workflows share one incident fingerprint and Issue.

**Tech Stack:** TypeScript, Zod, Kysely, SQLite, Vitest, GitHub Actions, jq, Biome.

**Spec:** `docs/specs/2026-09-20-evaluation-time-gates/`

## Global Constraints

- Preserve `Event` as the only fact node; this change does not alter public facts, ranking, readiness, or publishing rules.
- Do not change evaluation weights, sample thresholds, the measured-evidence-only policy, or the 80-point target.
- Do not refresh or rewrite `data/snapshot/v1.json` or `data/reports/system-evaluation.json` in the implementation PR.
- Do not restore any commented schedule, trigger Pages, or set `publish_weekly=true`.
- Keep SQLite as the verified default; do not claim MySQL compatibility.
- Keep v1 report read compatibility and the legacy `--fail-on-regression` flag for one release cycle.
- Use `npm`; run `npm run check` and `npm run build` before completion.
- Update both `CHANGELOG.md` and `src/catalog/product.ts` for the user-visible workflow behavior.
- Keep workflow Issue output limited to public-safe scores, ages, reason codes, suggested actions, and Actions URLs.

## Review Focus

- A valid v1 report whose `finishedAt` includes a timezone offset must normalize to the same UTC instant; Task 1 adds this parser test.
- A source timestamp later than `evaluationAsOf` must never create a negative age that counts as fresh; Task 2 adds boundary and future-time tests.
- An invalid operational baseline must still produce an auditable decision without dispatching a refresh that could overwrite evidence; Task 4 adds this policy test.
- A queued or in-progress Data Refresh must prevent duplicate dispatch even when the score is below 60; Task 5 adds the workflow contract assertion.
- A fresh checkout mtime with an old versioned report must remain stale, while an old mtime with a fresh report must remain healthy; Task 4 adds both Monitor tests.

---

## File Structure

- Create `src/pipeline/evaluation-context.ts`: explicit clock, gate mode, ISO parsing, cutoff and age helpers.
- Modify `src/pipeline/evaluation-progress.ts`: schema v1/v2 validation, normalization, v2 report construction, context-aware comparison and summary.
- Modify `src/pipeline/evaluate.ts`: point-in-time evidence selection and optional persistence.
- Modify `src/cli/evaluate.ts`: explicit `change` and `operational` gate orchestration.
- Create `src/pipeline/evaluation-policy.ts`: pure operational threshold, reason code and fingerprint logic.
- Modify `src/cli/monitor-check.ts`: versioned evaluation freshness authority.
- Modify `src/pipeline/monitor-alert.ts`: shared evaluation staleness reason codes and incident fingerprint.
- Modify `.github/workflows/ci.yml`: deterministic change gate.
- Modify `.github/workflows/quality-guard.yml`: operational policy, single Issue, cooldown, one incremental refresh, final failure.
- Modify `.github/workflows/monitor.yml`: shared Issue marker and evaluation freshness fields.
- Modify `.github/workflows/data-refresh.yml`: persist the next v2 operational baseline only after a real successful refresh.
- Modify focused tests under `tests/` before each production change.

---

### Task 1: Add the Explicit Time Context and Versioned Report Contract

**Files:**

- Create: `src/pipeline/evaluation-context.ts`
- Modify: `src/pipeline/evaluation-progress.ts`
- Modify: `tests/evaluation-progress.test.ts`

**Interfaces:**

- Produces: `EvaluationGateMode`, `EvaluationContext`, `parseEvaluationInstant`, `isAtOrBefore`, `isWithinPastWindow`.
- Produces: `SystemEvaluationReportV1`, `SystemEvaluationReportV2`, `normalizeSystemEvaluationReport(value)`.
- Produces: `buildSystemEvaluationReport(evaluation, context)` and context-aware `compareSystemEvaluations(current, baseline)`.

- [ ] **Step 1: Write failing time-context and report-normalization tests**

Add these cases to `tests/evaluation-progress.test.ts`:

```ts
it("normalizes a v1 report to the same UTC evaluation instant", () => {
  const v1 = {
    ...buildLegacyReport(),
    schemaVersion: 1,
    finishedAt: "2026-08-26T20:39:38.724+08:00",
  };

  expect(normalizeSystemEvaluationReport(v1)).toMatchObject({
    schemaVersion: 2,
    evaluationAsOf: "2026-08-26T12:39:38.724Z",
    gateMode: "operational",
  });
});

it("rejects a v1 report without a valid finishedAt", () => {
  expect(() =>
    normalizeSystemEvaluationReport({
      ...buildLegacyReport(),
      schemaVersion: 1,
      finishedAt: "not-a-time",
    }),
  ).toThrow(/finishedAt/);
});

it("fails comparison when reference times differ", () => {
  const baseline = reportV2("2026-08-26T12:39:38.724Z", "operational");
  const current = reportV2("2026-09-20T00:00:00.000Z", "change");

  expect(compareSystemEvaluations(current, baseline)).toMatchObject({
    passed: false,
    contextError: "evaluation_context_mismatch",
    regressions: [
      "evaluation context mismatch: baseline 2026-08-26T12:39:38.724Z, current 2026-09-20T00:00:00.000Z",
    ],
  });
});
```

Add helper builders with complete required report fields. Use one measured `coverage` dimension so schema validation exercises dimensions instead of accepting `unknown` data.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
npm test -- --run tests/evaluation-progress.test.ts
```

Expected: FAIL because the context module, v2 fields and normalizer do not exist.

- [ ] **Step 3: Implement the explicit context helpers**

Create `src/pipeline/evaluation-context.ts`:

```ts
export type EvaluationGateMode = "change" | "operational";

export interface EvaluationContext {
  asOf: Date;
  gateMode: EvaluationGateMode;
  persist: boolean;
}

export function parseEvaluationInstant(value: string, field: string): Date {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid ${field}: ${value}`);
  return new Date(timestamp);
}

export function isAtOrBefore(value: string | null, asOf: Date): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= asOf.getTime();
}

export function isWithinPastWindow(value: string | null, asOf: Date, windowMs: number): boolean {
  if (!isAtOrBefore(value, asOf)) return false;
  const ageMs = asOf.getTime() - Date.parse(value as string);
  return ageMs <= windowMs;
}
```

- [ ] **Step 4: Add strict v1/v2 schemas and normalization**

In `src/pipeline/evaluation-progress.ts`, set `SYSTEM_EVALUATION_SCHEMA_VERSION = 2`, add strict Zod schemas for every `EvaluationDimension`, `EvaluationImprovement`, shared evaluation field, v1 report and v2 report, then implement:

```ts
export function normalizeSystemEvaluationReport(value: unknown): SystemEvaluationReportV2 {
  const version = z.object({ schemaVersion: z.number().int() }).parse(value).schemaVersion;
  if (version === 2) return systemEvaluationReportV2Schema.parse(value);
  if (version !== 1) throw new Error(`Unsupported system evaluation schema: ${version}`);
  const legacy = systemEvaluationReportV1Schema.parse(value);
  const evaluationAsOf = parseEvaluationInstant(legacy.finishedAt, "finishedAt").toISOString();
  return systemEvaluationReportV2Schema.parse({
    ...legacy,
    schemaVersion: 2,
    evaluationAsOf,
    gateMode: "operational",
  });
}
```

Change report construction to accept `EvaluationContext`, write `evaluationAsOf: context.asOf.toISOString()` and `gateMode: context.gateMode`, and add `contextError: "evaluation_context_mismatch" | null` to `EvaluationComparison`.

- [ ] **Step 5: Run focused tests, typecheck and commit**

Run:

```bash
npm test -- --run tests/evaluation-progress.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add src/pipeline/evaluation-context.ts src/pipeline/evaluation-progress.ts tests/evaluation-progress.test.ts
git commit -m "feat: version evaluation time context"
```

---

### Task 2: Make System Scoring Point-in-Time and Side-Effect Controlled

**Files:**

- Modify: `src/pipeline/evaluate.ts`
- Modify: `src/cli/evaluate.ts`
- Modify: `src/pipeline/export.ts`
- Modify: `src/server/app.ts`
- Modify: `tests/evaluate.test.ts`
- Create: `tests/evaluation-time.test.ts`

**Interfaces:**

- Consumes: `EvaluationContext`, `isAtOrBefore`, `isWithinPastWindow` from Task 1.
- Produces: `evaluateSystem(db, context): Promise<EvaluationResult>`.
- Preserves: `latestEvaluation(db)` for public and admin consumers.

- [ ] **Step 1: Write failing boundary tests for time helpers and persistence**

Add to `tests/evaluate.test.ts`:

```ts
it("never treats a future timestamp as recent", () => {
  const asOf = new Date("2026-08-26T12:00:00.000Z");
  expect(isWithinPastWindow("2026-08-26T12:00:00.000Z", asOf, 7 * 86_400_000)).toBe(true);
  expect(isWithinPastWindow("2026-08-26T12:00:00.001Z", asOf, 7 * 86_400_000)).toBe(false);
  expect(isWithinPastWindow("invalid", asOf, 7 * 86_400_000)).toBe(false);
});
```

Create `tests/evaluation-time.test.ts` with an in-memory migrated database. Seed one source, two source runs, two checks and two published events on opposite sides of `AS_OF`. Run with `persist=false` twice while advancing Vitest's fake system time. Assert equal scores and zero new `evaluation_runs`. Then run with `persist=true` and assert exactly one row.

Use these fixed timestamps:

```ts
const AS_OF = new Date("2026-08-26T12:00:00.000Z");
const INCLUDED = "2026-08-26T11:59:59.000Z";
const EXCLUDED = "2026-08-26T12:00:01.000Z";
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
npm test -- --run tests/evaluate.test.ts tests/evaluation-time.test.ts
```

Expected: FAIL because `evaluateSystem` has no context, writes every run and reads `Date.now()`.

- [ ] **Step 3: Filter evidence before deriving latest rows and windows**

Change the signature:

```ts
export async function evaluateSystem(
  db: Kysely<DatabaseSchema>,
  context: EvaluationContext,
): Promise<EvaluationResult> {
```

Capture execution timestamps independently from the scoring clock. Before `latestBySource`, filter runs and checks by `finished_at <= context.asOf`. Filter Event, Signal, Scout and relation rows by the existence timestamp specified in the approved SYSTEM spec. Replace the wall-clock calculations with:

```ts
const recentPublished = published.filter(
  (event) =>
    isAtOrBefore(event.happened_at, context.asOf) &&
    isWithinPastWindow(event.happened_at, context.asOf, 30 * 86_400_000),
).length;

const activeWithRecentSuccess = activeSources.filter((source) =>
  isWithinPastWindow(source.last_success_at, context.asOf, 7 * 86_400_000),
).length;
```

No scoring expression may call `Date.now()` or create an implicit current `Date`.

- [ ] **Step 4: Make evaluation-run persistence explicit**

Wrap the insert:

```ts
if (context.persist) {
  await db
    .insertInto("evaluation_runs")
    .values({
      id,
      release_version: productVersion,
      status,
      overall_score: overallScore,
      dimensions_json: JSON.stringify(dimensions),
      capability_snapshot_json: JSON.stringify(capabilities),
      notes,
      started_at: startedAt,
      finished_at: finishedAt,
    })
    .execute();
}
```

The returned result remains complete in both modes.

- [ ] **Step 5: Update direct evaluator callers with explicit contexts**

Search with:

```bash
rg -n "evaluateSystem\(" src tests
```

For the admin pipeline endpoint and the export fallback, capture one `runStartedAt` and use `{ asOf: runStartedAt, gateMode: "operational", persist: true }`, preserving their existing persisted-evaluation behavior. In `src/cli/evaluate.ts`, pass the same temporary operational context until Task 3 replaces it with parsed gate options. For read-only or test evaluation use `persist: false`. Do not choose a new `Date` at multiple points in one run; capture it once at the caller boundary.

- [ ] **Step 6: Run focused tests, the integration test and commit**

Run:

```bash
npm test -- --run tests/evaluate.test.ts tests/evaluation-time.test.ts tests/integration.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add src/pipeline/evaluate.ts src/cli/evaluate.ts src/pipeline/export.ts src/server/app.ts tests/evaluate.test.ts tests/evaluation-time.test.ts
git commit -m "feat: evaluate evidence at a fixed time"
```

---

### Task 3: Add Explicit Change and Operational CLI Gates

**Files:**

- Modify: `src/cli/evaluate.ts`
- Create: `tests/cli/evaluate.test.ts`
- Modify: `tests/evaluation-progress.test.ts`

**Interfaces:**

- Consumes: v1/v2 normalizer and explicit evaluator context.
- Produces: `resolveEvaluationInvocation(args, baseline, runStartedAt)` for pure option validation.
- Produces: output payload with either `comparison` for change mode or `operationalDecision` for operational mode after Task 4.

- [ ] **Step 1: Write failing CLI option-resolution tests**

Create `tests/cli/evaluate.test.ts`:

```ts
it("inherits the normalized baseline time for change gate", () => {
  const baseline = legacyReport("2026-08-26T12:39:38.724Z");
  expect(
    resolveEvaluationInvocation(
      ["--gate=change", "--baseline=baseline.json", "--fail-on-regression"],
      normalizeSystemEvaluationReport(baseline),
      new Date("2026-09-20T00:00:00.000Z"),
    ),
  ).toMatchObject({
    gateMode: "change",
    asOf: new Date("2026-08-26T12:39:38.724Z"),
    persist: false,
  });
});

it("rejects change gate without a baseline", () => {
  expect(() =>
    resolveEvaluationInvocation(
      ["--gate=change"],
      null,
      new Date("2026-09-20T00:00:00.000Z"),
    ),
  ).toThrow(/requires --baseline/);
});

it("rejects a conflicting change-gate time", () => {
  expect(() =>
    resolveEvaluationInvocation(
      ["--gate=change", "--baseline=baseline.json", "--as-of=2026-09-20T00:00:00.000Z"],
      normalizeSystemEvaluationReport(legacyReport("2026-08-26T12:39:38.724Z")),
      new Date("2026-09-20T00:00:00.000Z"),
    ),
  ).toThrow(/cannot override baseline evaluationAsOf/);
});

it("uses one captured run time for operational gate", () => {
  const runStartedAt = new Date("2026-09-20T00:00:00.000Z");
  expect(resolveEvaluationInvocation(["--gate=operational"], null, runStartedAt)).toEqual({
    gateMode: "operational",
    asOf: runStartedAt,
    persist: false,
    failOnRegression: false,
    legacyFlagUsed: false,
  });
});
```

- [ ] **Step 2: Run the CLI test and verify it fails**

Run:

```bash
npm test -- --run tests/cli/evaluate.test.ts
```

Expected: FAIL because the resolver and explicit gates do not exist.

- [ ] **Step 3: Implement option validation and safe report reads**

Export a pure resolver. `--gate` accepts only `change` or `operational`. Map the legacy combination `--fail-on-regression --baseline=<path>` to `change`, set `legacyFlagUsed=true`, and append a migration warning to the summary without printing it inside JSON stdout.

Replace the unchecked cast in `readReport` with a tagged result:

```ts
interface ReadReportResult {
  report: SystemEvaluationReportV2 | null;
  error: string | null;
}
```

Parse with `normalizeSystemEvaluationReport(JSON.parse(serialized))`. A missing or invalid baseline in change mode throws the recorded error and fails closed. Operational mode carries `{ report: null, error }` into Task 4 so it can emit `evaluation_report_invalid`, update the health Issue and avoid an unsafe refresh.

- [ ] **Step 4: Build the v2 report with the resolved context**

Use one captured `runStartedAt`:

```ts
const runStartedAt = new Date();
const baselineResult = baselinePath
  ? await readReport(baselinePath)
  : { report: null, error: "baseline path missing" };
const baseline = baselineResult.report;
const invocation = resolveEvaluationInvocation(process.argv.slice(2), baseline, runStartedAt);
const evaluation = await evaluateSystem(db, invocation);
const report = buildSystemEvaluationReport(evaluation, invocation);
const comparison =
  invocation.gateMode === "change" && baseline
    ? compareSystemEvaluations(report, baseline)
    : null;
```

Keep stdout as one valid JSON document. Preserve atomic output writes and summary append behavior.

- [ ] **Step 5: Prove the current v1 baseline passes change mode**

Use a temporary SQLite database and output path:

```bash
evaluation_db="$(mktemp -d)/evaluation.db"
DATABASE_URL="sqlite:${evaluation_db}" npm run db:seed
DATABASE_URL="sqlite:${evaluation_db}" npm run --silent evaluate:system -- \
  --skip-bootstrap \
  --gate=change \
  --baseline=data/reports/system-evaluation.json \
  --output=/tmp/evaluation-change.json \
  --fail-on-regression
```

Expected: exit 0; comparison passes; the repository report and snapshot remain unchanged.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npm test -- --run tests/cli/evaluate.test.ts tests/evaluation-progress.test.ts tests/evaluation-time.test.ts
npm run typecheck
git diff --check
```

Commit:

```bash
git add src/cli/evaluate.ts tests/cli/evaluate.test.ts tests/evaluation-progress.test.ts
git commit -m "feat: separate evaluation gate modes"
```

---

### Task 4: Add Operational Policy and Move Monitor to the Versioned Watermark

**Files:**

- Create: `src/pipeline/evaluation-policy.ts`
- Create: `tests/evaluation-policy.test.ts`
- Modify: `src/cli/evaluate.ts`
- Modify: `src/cli/monitor-check.ts`
- Modify: `src/pipeline/monitor-alert.ts`
- Modify: `tests/pipeline/monitor-alert.test.ts`
- Create: `tests/monitor-freshness.test.ts`

**Interfaces:**

- Produces: `decideOperationalEvaluation(input): OperationalEvaluationDecision`.
- Produces: reason codes `system_score_below_floor`, `evaluation_stale`, `evaluation_persistently_stale`, `evaluation_report_invalid`.
- Produces: stable `fingerprint` from policy version and sorted reason codes.
- Monitor consumes the normalized persisted report and exposes `evaluationAsOf` and `ageMinutes` in the freshness detail.

- [ ] **Step 1: Write failing absolute-policy tests**

Create `tests/evaluation-policy.test.ts`:

```ts
const NOW = new Date("2026-09-20T12:00:00.000Z");

it.each([
  [60, "2026-09-20T00:00:01.000Z", "ok", []],
  [59, "2026-09-20T00:00:01.000Z", "critical", ["system_score_below_floor"]],
  [60, "2026-09-19T12:00:00.000Z", "critical", ["evaluation_stale"]],
  [60, "2026-09-17T12:00:00.000Z", "critical", ["evaluation_persistently_stale"]],
] as const)("applies absolute score and age policy", (score, asOf, status, reasonCodes) => {
  expect(
    decideOperationalEvaluation({
      currentScore: score,
      persistedEvaluationAsOf: asOf,
      reportValid: true,
      now: NOW,
    }),
  ).toMatchObject({ status, reasonCodes });
});

it("does not authorize refresh for an invalid persisted report", () => {
  expect(
    decideOperationalEvaluation({
      currentScore: null,
      persistedEvaluationAsOf: null,
      reportValid: false,
      now: NOW,
    }),
  ).toMatchObject({
    status: "critical",
    reasonCodes: ["evaluation_report_invalid"],
    refreshEligible: false,
  });
});

it("keeps the fingerprint stable when reason order changes", () => {
  const left = operationalFingerprint(["evaluation_stale", "system_score_below_floor"]);
  const right = operationalFingerprint(["system_score_below_floor", "evaluation_stale"]);
  expect(left).toBe(right);
});
```

- [ ] **Step 2: Write failing Monitor authority tests**

Create `tests/monitor-freshness.test.ts` against an exported pure `evaluateVersionedFreshness` helper:

```ts
it("stays critical when checkout mtime is fresh but the report is old", () => {
  expect(
    evaluateVersionedFreshness({
      evaluationAsOf: "2026-09-17T11:59:59.000Z",
      fileMtime: "2026-09-20T11:59:59.000Z",
      now: new Date("2026-09-20T12:00:00.000Z"),
    }),
  ).toMatchObject({ status: "critical", detail: { ageMinutes: 4_320 } });
});

it("stays healthy when the report is fresh but checkout mtime is old", () => {
  expect(
    evaluateVersionedFreshness({
      evaluationAsOf: "2026-09-20T11:30:00.000Z",
      fileMtime: "2026-08-26T12:00:00.000Z",
      now: new Date("2026-09-20T12:00:00.000Z"),
    }),
  ).toMatchObject({ status: "ok", detail: { ageMinutes: 30 } });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run:

```bash
npm test -- --run tests/evaluation-policy.test.ts tests/monitor-freshness.test.ts tests/pipeline/monitor-alert.test.ts
```

Expected: FAIL because the policy and versioned freshness helper do not exist.

- [ ] **Step 4: Implement the pure operational policy**

Create `src/pipeline/evaluation-policy.ts` with constants:

```ts
export const OPERATIONAL_POLICY_VERSION = 1;
export const QUALITY_FLOOR = 60;
export const EVALUATION_CRITICAL_AGE_MS = 24 * 60 * 60 * 1_000;
export const EVALUATION_PERSISTENT_AGE_MS = 72 * 60 * 60 * 1_000;
```

If `reportValid=false`, return only `evaluation_report_invalid` and `refreshEligible=false`. Otherwise calculate non-negative age from `persistedEvaluationAsOf`; invalid or future timestamps are report-invalid. At `>=72h`, emit only the more specific persistent reason. At `>=24h` and `<72h`, emit stale. Add score reason independently. Hash `evaluation-policy:v1|${sortedReasons.join("|") || "ok"}` with SHA-256 and keep 16 hex characters.

- [ ] **Step 5: Add operational decision to CLI output**

For `--gate=operational`, include:

```ts
const operationalDecision = decideOperationalEvaluation({
  currentScore: report.overallScore,
  persistedEvaluationAsOf: baseline?.evaluationAsOf ?? null,
  reportValid: baseline !== null && baselineResult.error === null,
  now: runStartedAt,
});
```

Write `{ ...report, operationalDecision }`. Do not make the CLI exit before workflows can upload evidence and update the Issue; Quality Guard owns the final failure step.

- [ ] **Step 6: Replace Monitor mtime authority**

Read and normalize `data/reports/system-evaluation.json`. Pass its `evaluationAsOf` into `evaluateVersionedFreshness`. Retain file mtime only as `detail.fileMtime` for diagnosis. Update monitor hard-failure mapping so the persistent evaluation reason maps to `evaluation_persistently_stale`, and accept the legacy `snapshot_persistently_stale` marker only for cooldown compatibility.

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
npm test -- --run tests/evaluation-policy.test.ts tests/monitor-freshness.test.ts tests/pipeline/monitor-alert.test.ts
npm run typecheck
```

Commit:

```bash
git add src/pipeline/evaluation-policy.ts src/cli/evaluate.ts src/cli/monitor-check.ts src/pipeline/monitor-alert.ts tests/evaluation-policy.test.ts tests/monitor-freshness.test.ts tests/pipeline/monitor-alert.test.ts
git commit -m "feat: gate operational evaluation freshness"
```

---

### Task 5: Wire CI, Quality Guard, Monitor and Data Refresh

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/quality-guard.yml`
- Modify: `.github/workflows/monitor.yml`
- Modify: `.github/workflows/data-refresh.yml`
- Modify: `tests/workflows/source-governance.test.ts`

**Interfaces:**

- Consumes: CLI `change` and `operational` gate payloads from Tasks 3 and 4.
- Produces: one `monitor:critical` Issue with marker `agent-pulse-monitor:v3` and policy fingerprint.
- Produces: at most one `data-refresh.yml` dispatch with `mode=incremental`.

- [ ] **Step 1: Write failing workflow contract assertions**

Extend `tests/workflows/source-governance.test.ts` with exact assertions:

```ts
expect(ci).toContain("--gate=change");
expect(ci).toContain("--fail-on-regression");
expect(guard).toContain("--gate=operational");
expect(guard).toContain("agent-pulse-monitor:v3 fingerprint=");
expect(guard).toContain("gh run list --workflow data-refresh.yml --status in_progress");
expect(guard).toContain("gh workflow run data-refresh.yml --ref main --field mode=incremental");
expect(guard).not.toContain("publish_weekly=true");
expect(guard.indexOf("Upload evaluation evidence")).toBeLessThan(
  guard.indexOf("Update the single monitor incident"),
);
expect(guard.indexOf("Update the single monitor incident")).toBeLessThan(
  guard.indexOf("Trigger one bounded system update"),
);
expect(guard.indexOf("Trigger one bounded system update")).toBeLessThan(
  guard.indexOf("Fail the operational gate"),
);
expect(refresh).toContain("--gate=operational");
expect(monitor).toContain("agent-pulse-monitor:v3 fingerprint=");
for (const workflow of [guard, monitor, refresh]) {
  expect(workflow).toContain("# schedule:");
}
```

Also assert the dispatch decision treats queued or in-progress refresh as `dispatch=false`, even when cooldown has expired.

- [ ] **Step 2: Run the workflow test and verify it fails**

Run:

```bash
npm test -- --run tests/workflows/source-governance.test.ts
```

Expected: FAIL on missing gate flags, v3 marker, ordering and in-progress protection.

- [ ] **Step 3: Update CI to use deterministic change mode**

Keep the existing previous-commit baseline extraction. Change only the evaluator call:

```yaml
- name: Evaluate system capability and prevent score regression
  shell: bash
  run: |
    set -euo pipefail
    npm run --silent evaluate:system -- \
      --skip-bootstrap \
      --gate=change \
      --baseline="$RUNNER_TEMP/evaluation-baseline.json" \
      --output="$RUNNER_TEMP/evaluation-current.json" \
      --summary="$GITHUB_STEP_SUMMARY" \
      --fail-on-regression
```

Do not modify triggers, permissions, timeout or the later export/build steps.

- [ ] **Step 4: Update Quality Guard without early exit**

Add `issues: write` to the existing least-privilege permissions; keep `actions: write` and `contents: read` unchanged.

Run operational evaluation into a temporary JSON file. Extract `operationalDecision.status`, `reasonCodes`, `fingerprint`, `refreshEligible` and score to `$GITHUB_OUTPUT`. Always upload the report before mutation steps.

Upsert the existing open Issue with label `monitor:critical` and marker:

```text
<!-- agent-pulse-monitor:v3 fingerprint=<fingerprint> -->
```

The Issue body contains evaluation time, persisted waterline, age, score, reason codes, suggested incremental refresh and the current Actions URL. It does not include the full evaluation JSON.

Before dispatch, query queued and in-progress Data Refresh runs. Set `dispatch=false` if either exists, if cooldown is active, or if `refreshEligible=false`. Preserve the current retry rule for the latest completed failed refresh. Add a final step:

```yaml
- name: Fail the operational gate
  if: always() && steps.evaluation.outputs.status == 'critical'
  run: exit 1
```

- [ ] **Step 5: Update Monitor to the shared v3 incident**

Keep manual-run dry-run behavior. Render `evaluationAsOf`, age and reason code from monitor output. Query the existing `monitor:critical` Issue and update the v3 marker so Monitor and Quality Guard converge on one Issue. Preserve hard rules for site outage and monitor crash.

- [ ] **Step 6: Update Data Refresh to persist v2 only after successful evidence refresh**

Change the existing evaluation call to `--gate=operational`. Keep it after remote snapshot merge and source reconciliation. Keep JSON validation, privacy scan, snapshot write and single commit ordering. Do not add `--fail-on-regression`; Data Refresh records the real current score even when it is below 60.

- [ ] **Step 7: Run workflow tests and YAML-sensitive checks**

Run:

```bash
npm test -- --run tests/workflows/source-governance.test.ts tests/cli/evaluate.test.ts tests/evaluation-policy.test.ts tests/pipeline/monitor-alert.test.ts
npm run lint
npm run typecheck
git diff --check
```

Expected: PASS; every schedule remains commented.

- [ ] **Step 8: Commit workflow integration**

```bash
git add .github/workflows/ci.yml .github/workflows/quality-guard.yml .github/workflows/monitor.yml .github/workflows/data-refresh.yml tests/workflows/source-governance.test.ts
git commit -m "ci: separate change and operational gates"
```

---

### Task 6: Synchronize Product Records and Run Full Verification

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `src/catalog/product.ts`
- Verify only: `data/snapshot/v1.json`
- Verify only: `data/reports/system-evaluation.json`

**Interfaces:**

- Consumes: completed implementation and evidence from Tasks 1–5.
- Produces: synchronized Unreleased changelog entries and final verification evidence.

- [ ] **Step 1: Update both Changelog authorities**

Add one concise Chinese bullet under `CHANGELOG.md` `[Unreleased]` and the same user-visible meaning to `releases[0].changes`:

```text
系统评测拆分为固定参考时刻的 PR 回归门禁与当前时间的运营时效门禁：自然时间流逝不再阻塞无关变更，真实数据过期仍会更新单一健康告警并按冷却期触发一次有界刷新；Monitor 改用版本化评测水位，不再依赖 checkout 文件时间。
```

Update the `evaluation` capability evidence to mention versioned time context and dual gates. Do not change its maturity or status without new production evidence.

- [ ] **Step 2: Add a release-contract assertion if existing tests require exact synchronization**

Run the current release contract test:

```bash
npm test -- --run tests/release.test.ts
```

Add only the assertion required by the repository's current Changelog synchronization pattern; do not introduce a second parser.

- [ ] **Step 3: Run the complete repository gate**

Run:

```bash
npm run check
npm run build
```

Expected: lint, typecheck, all unit/integration tests, static export, public validation and build pass. Record the exact test file and test counts from Vitest output.

- [ ] **Step 4: Run both gate acceptance probes without repository writes**

Use a temporary database and output directory. First run change mode against the existing v1 baseline and expect exit 0. Then run operational mode and expect a JSON decision that identifies the current stale/low-score state without dispatching a workflow:

```bash
probe_dir="$(mktemp -d)"
DATABASE_URL="sqlite:${probe_dir}/evaluation.db" npm run db:seed
DATABASE_URL="sqlite:${probe_dir}/evaluation.db" npm run --silent evaluate:system -- \
  --skip-bootstrap \
  --gate=change \
  --baseline=data/reports/system-evaluation.json \
  --output="${probe_dir}/change.json" \
  --fail-on-regression
DATABASE_URL="sqlite:${probe_dir}/evaluation.db" npm run --silent evaluate:system -- \
  --skip-bootstrap \
  --gate=operational \
  --baseline=data/reports/system-evaluation.json \
  --output="${probe_dir}/operational.json"
jq '{schemaVersion,evaluationAsOf,gateMode,comparison,operationalDecision}' \
  "${probe_dir}/change.json" "${probe_dir}/operational.json"
```

Expected: change comparison passes; operational decision is critical for the existing old data. The CLI probe does not update an Issue or dispatch Data Refresh.

- [ ] **Step 5: Prove protected repository artifacts and schedules did not change**

Run:

```bash
git diff origin/main -- data/snapshot/v1.json data/reports/system-evaluation.json
rg -n '^\s*(#\s*)?schedule:' .github/workflows
git diff --check
git status --short
```

Expected: no snapshot/report diff; the four existing schedule declarations remain commented; only intended implementation, tests, docs and Changelog files are changed.

- [ ] **Step 6: Commit product records**

```bash
git add CHANGELOG.md src/catalog/product.ts
git commit -m "docs: record time-aware evaluation gates"
```

- [ ] **Step 7: Review the complete branch**

Inspect:

```bash
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Confirm each task has one focused commit, no production data changed, no schedule was restored and the implementation matches the approved spec before requesting final code review.
