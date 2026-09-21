# Embodied Priority Source Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put 12–18 highest-value embodied-data sources behind tested `SourceAdapter` contracts and start auditable shadow observation without silently promoting them to active.

**Architecture:** Select the focus cohort from the governed source map, reuse shared RSS/Atom, GitHub Releases, JSON API, and structured HTML adapters, and add source-specific fixtures/configuration rather than branching in orchestration. Extend audit selection and reporting so the cohort can be verified together, while lifecycle promotion remains evidence-gated and manual.

**Tech Stack:** TypeScript 5.9, existing `SourceAdapter`, Vitest fixtures, safe fetcher, Kysely source checks, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-20-embodied-data-evolution-timeline-design.md`

## Global Constraints

- Plan dependency: execute `docs/superpowers/plans/2026-09-20-embodied-source-map-and-event-backfill.md` first.
- All collectors stay behind `SourceAdapter`; orchestration gets no source slug special cases.
- Prefer official API, RSS/Atom, GitHub Releases, and stable structured pages in that order.
- Re-run SSRF checks on redirects; preserve timeout, bounded retry, backoff/jitter, `Retry-After`, rate budget, and response-size limits.
- Failed runs do not advance cursor, ETag, Last-Modified, or fingerprint.
- New sources remain `draft` until fixture, contract, compliance, and live audit checks pass; this plan never promotes to `active`.
- Restricted/login/CAPTCHA/paywall sources stay restricted or manual.
- Public reports contain no raw payload, token, cookie, database ID, or local path.

## Review Focus

- A cohort manifest containing a retired, legacy, restricted, or unknown source must fail before network access; Task 1 tests every case.
- A generic HTML adapter returning undated navigation links must fail the normalized-item contract; Task 2 tests schema drift and empty-result behavior.
- One failed source must not stop other cohort audits or advance its incremental state; Task 3 tests isolation and cursor preservation.
- Repeated audit runs must not promote a source merely because HTTP returned 200; Task 4 tests lifecycle gating on parsed items, quality, policy, and run count.
- Scheduled runs must not expose raw payload or create a false production incident from draft/shadow failures; Task 5 tests report and monitor boundaries.

---

## File Structure

- Create `src/catalog/embodied-data/priority-sources.ts`: the reviewed 12–18-source cohort manifest.
- Create `tests/fixtures/sources/embodied-priority/`: sanitized RSS, Atom, JSON, HTML success, empty, and drift fixtures.
- Create `tests/collectors/embodied-priority-contracts.test.ts`: data-driven adapter contract suite.
- Modify source entries in `src/catalog/embodied-data/sources.ts`: correct endpoint, adapter, acquisition, lifecycle, and adapter version after validation.
- Modify `src/cli/audit-sources.ts` and `src/pipeline/source-audit.ts`: repeatable cohort selection.
- Modify `src/pipeline/observation.ts`: evidence-gated shadow eligibility.
- Create `data/reports/embodied-priority-source-health.json`: privacy-safe live audit evidence.
- Modify `.github/workflows/source-audit.yml`: explicit cohort audit and report freshness.
- Modify tests for CLI, audit, observation, workflow, privacy, and monitor behavior.

### Task 1: Define and validate the priority cohort

**Files:**
- Create: `src/catalog/embodied-data/priority-sources.ts`
- Test: `tests/embodied-priority-sources.test.ts`

**Interfaces:**
- Produces: `EmbodiedPrioritySource`, `embodiedPrioritySources`, derived `embodiedPrioritySourceSlugs`, and `validateEmbodiedPrioritySources(catalog, entries)`.
- Consumes: expanded `embodiedSourceCatalog` from Plan 1.

- [ ] **Step 1: Write failing cohort validation tests**

```ts
expect(embodiedPrioritySources.length).toBeGreaterThanOrEqual(12);
expect(embodiedPrioritySources.length).toBeLessThanOrEqual(18);
expect(() =>
  validateEmbodiedPrioritySources(catalog, [{ slug: "unknown", adapterVersion: "1" }]),
).toThrow("unknown");
expect(() =>
  validateEmbodiedPrioritySources(catalog, [{ slug: restricted.slug, adapterVersion: "1" }]),
).toThrow("restricted");
expect(() =>
  validateEmbodiedPrioritySources(catalog, [{ slug: legacy.slug, adapterVersion: "1" }]),
).toThrow("embodied-data");
```

Also require at least six CN sources, at least four GLOBAL sources, all six pipeline stages, and at least four source categories.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/embodied-priority-sources.test.ts`

Expected: FAIL because the cohort module does not exist.

- [ ] **Step 3: Select the reviewed cohort**

Choose 12–18 sources from the Plan 1 ledger with stable endpoints. Start with the following ordered candidates and exclude any that failed live verification: SAMR embodied standards, Beijing Humanoid Robot Innovation Center, Shanghai Humanoid Robotics Innovation Center, Galbot, Shanghai AI Lab InternRobotics, Horizon HoloMotion, OpenDriveLab/AgiBot, DataTang embodied data, PNP Robotics, NVIDIA Isaac GR00T, Figure AI, 1X, Toyota Research Institute, EgoNet, RoboTwin, NIST Physical AI, and ITU-T Robot Data Factory.

- [ ] **Step 4: Implement validation and run tests**

Run: `npx vitest run tests/embodied-priority-sources.test.ts`

Expected: PASS with 12–18 unique, current-scope, non-restricted, adapter-backed sources.

- [ ] **Step 5: Commit the cohort**

```bash
git add src/catalog/embodied-data/priority-sources.ts tests/embodied-priority-sources.test.ts
git commit -m "feat: define priority embodied sources"
```

### Task 2: Add fixture-backed adapter contracts

**Files:**
- Create: `tests/fixtures/sources/embodied-priority/manifest.json`
- Create: `tests/fixtures/sources/embodied-priority/*.xml`
- Create: `tests/fixtures/sources/embodied-priority/*.json`
- Create: `tests/fixtures/sources/embodied-priority/*.html`
- Create: `tests/collectors/embodied-priority-contracts.test.ts`
- Modify: `src/catalog/embodied-data/sources.ts`
- Modify: `src/collectors/rss.ts`, `src/collectors/github-releases.ts`, `src/collectors/json-api.ts`, or `src/collectors/web-scraper.ts` only when a fixture exposes a general parser defect.

**Interfaces:**
- Consumes: `getAdapter(kind)` and `SourceDescriptor`.
- Produces: one success fixture and one empty/drift fixture for every selected source, normalized to `CollectedSignal[]`.

- [ ] **Step 1: Write the data-driven failing contract test**

```ts
for (const fixture of manifest) {
  it(`${fixture.slug} normalizes stable dated items`, async () => {
    const signals = await getAdapter(fixture.adapter).collect(descriptor(fixture), context(fixture));
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(signal.title.trim()).not.toBe("");
      expect(new URL(signal.url).protocol).toBe("https:");
      expect(Number.isFinite(Date.parse(signal.publishedAt))).toBe(true);
      expect(signal.rawMeta.dateInferred).not.toBe(true);
    }
  });
}
```

Add negative cases for empty body, undated cards, malformed JSON/XML, duplicate URLs, redirect mismatch, and schema drift.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/collectors/embodied-priority-contracts.test.ts`

Expected: FAIL because fixtures and normalized configuration are absent.

- [ ] **Step 3: Capture sanitized fixtures from official endpoints**

Keep only the smallest representative structure needed by the parser. Remove analytics scripts, cookies, personal data, and unrelated article bodies. Record original endpoint and capture date in `manifest.json`; never store authentication material or full raw responses.

- [ ] **Step 4: Fix shared parsers and source configuration**

Prefer config correction over parser changes. If a parser fix is required, make it generic and add its regression fixture to the existing adapter test as well. Do not branch on `source.slug` inside a collector.

- [ ] **Step 5: Run all collector tests**

Run: `npx vitest run tests/collectors tests/collectors.test.ts`

Expected: PASS, including success and drift/failure paths for every cohort source.

- [ ] **Step 6: Commit fixtures and contracts**

```bash
git add tests/fixtures/sources/embodied-priority tests/collectors/embodied-priority-contracts.test.ts src/catalog/embodied-data/sources.ts src/collectors
git commit -m "test: verify priority source adapters"
```

### Task 3: Audit a cohort with failure isolation

**Files:**
- Modify: `src/cli/audit-sources.ts:8-80`
- Modify: `src/pipeline/source-audit.ts:20-100`
- Test: `tests/cli/audit-sources.test.ts`
- Test: `tests/pipeline/source-audit.test.ts`

**Interfaces:**
- Produces: repeatable `--source` parsing into `sourceSlugs: string[]`; `auditSources(..., { sourceIds })`.
- Consumes: cohort slugs from Task 1.

- [ ] **Step 1: Write failing multi-source CLI tests**

```ts
expect(parseAuditArgs(["--source", "a", "--source=b", "--source", "a"])).toMatchObject({
  sourceSlugs: ["a", "b"],
});
```

Add pipeline tests where `a` succeeds, `b` fails parsing, and `c` succeeds. Assert three results, one failed result, a finished job, and unchanged `state_json`/cursor for `b`.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/cli/audit-sources.test.ts tests/pipeline/source-audit.test.ts`

Expected: FAIL because only one source is supported.

- [ ] **Step 3: Implement deduplicated multi-source selection**

Resolve all requested slugs before starting the job; fail before network access if any slug is unknown. Query by IDs, preserve request order in the report, and retain the existing all-sources behavior when no `--source` flag is supplied.

- [ ] **Step 4: Preserve per-source isolation and state**

Use the existing bounded concurrent map. Persist a check for every source, finish the job in `finally`, and never update incremental state from the audit path.

- [ ] **Step 5: Run CLI and audit tests**

Run: `npx vitest run tests/cli/audit-sources.test.ts tests/pipeline/source-audit.test.ts tests/collectors/cache.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit cohort audit support**

```bash
git add src/cli/audit-sources.ts src/pipeline/source-audit.ts tests/cli/audit-sources.test.ts tests/pipeline/source-audit.test.ts
git commit -m "feat: audit source cohorts"
```

### Task 4: Gate shadow observation on contract and live evidence

**Files:**
- Modify: `src/pipeline/observation.ts`
- Modify: `src/cli/observe-sources.ts`
- Test: `tests/observation-mode.test.ts`
- Test: `tests/source-operations.test.ts`
- Create: `tests/fixtures/embodied-data/priority-source-observation.json`

**Interfaces:**
- Produces: expanded `observationEligibility(db)` and `setObservationMode(db, sourceId, enabled)` behavior requiring current scope, reviewed policy, passing fixture contract, and three successful live checks.
- Consumes: latest `SourceCheck` rows and adapter-version entries from `embodiedPrioritySources`; the fixture suite proves those versions satisfy the contract.

- [ ] **Step 1: Write failing eligibility tests**

Test rejection for: draft without a contract, only HTTP 200 but zero parsed items, stale success, policy restricted, one/two successful checks, schema drift, and duplicate-ratio degradation. Test acceptance only with three healthy checks at least six hours apart and no intervening failure.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/observation-mode.test.ts tests/source-operations.test.ts`

Expected: FAIL because eligibility does not consume fixture-contract evidence or a three-check window.

- [ ] **Step 3: Implement the evidence gate**

Allow a `draft` priority source to become eligible after it satisfies the contract and three-check gate. On `npm run observe:sources -- --confirm`, call `transitionSource("draft", "verify")`, persist `shadow`, and then enable observation. Existing `shadow` sources only toggle observation. Never promote to `active` here.

- [ ] **Step 4: Run observation and operation tests**

Run: `npx vitest run tests/observation-mode.test.ts tests/source-operations.test.ts tests/activation-audit.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the shadow gate**

```bash
git add src/pipeline/observation.ts src/cli/observe-sources.ts tests/observation-mode.test.ts tests/source-operations.test.ts tests/fixtures/embodied-data/priority-source-observation.json
git commit -m "feat: gate embodied source shadow runs"
```

### Task 5: Run and publish privacy-safe cohort health evidence

**Files:**
- Create: `data/reports/embodied-priority-source-health.json`
- Modify: `.github/workflows/source-audit.yml`
- Modify: `tests/workflows/source-governance.test.ts`
- Modify: `tests/static-site-privacy.test.ts`
- Modify: `tests/monitor-freshness.test.ts`
- Modify: `CHANGELOG.md`
- Modify: `src/catalog/product.ts`

**Interfaces:**
- Consumes: cohort CLI and shadow gate from Tasks 3–4.
- Produces: versioned, privacy-safe cohort audit summary and scheduled freshness enforcement.

- [ ] **Step 1: Add failing workflow and privacy tests**

Assert the workflow audits the exact priority cohort, writes below `data/reports`, retains source slugs/status/counts/timestamps only, keeps the health-summary Issue marker, and does not treat draft/shadow failures alone as a production outage.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/workflows/source-governance.test.ts tests/static-site-privacy.test.ts tests/monitor-freshness.test.ts`

Expected: FAIL because no cohort report/workflow exists.

- [ ] **Step 3: Execute live audits in bounded batches**

Run the priority slugs with concurrency 4. Retry only transient network errors through the existing safe fetcher. Record failures honestly; move login/CAPTCHA/robots-blocked sources back to `restricted` or `pending` instead of weakening fetch rules.

Run pattern:

```bash
npm run sources:audit -- --source agibot-world --source horizon-holomotion --source itu-robot-data-factory --concurrency 4 --report data/reports/embodied-priority-source-health.json
```

- [ ] **Step 4: Complete the shadow evidence window**

Collect three healthy checks at least six hours apart for any source to be promoted from `draft` to `shadow`. Sources that do not complete the window remain `draft` in the final report; the plan is complete when all cohort entries have a truthful terminal result of `shadow`, `draft`, or `restricted`, not when every entry is forced to shadow.

- [ ] **Step 5: Wire scheduled freshness and issue evidence**

Update `source-audit.yml` to audit the cohort, refresh the versioned summary, and fail when the last successful cohort audit exceeds its declared freshness window. Preserve the existing Issue marker and do not publish raw samples.

- [ ] **Step 6: Update both changelog sources**

State the number of fixture-validated priority sources and the number that actually reached shadow. Do not call draft/restricted entries integrated or operational.

- [ ] **Step 7: Run the full gate and inspect the report**

Run: `npm run check && npm run build`

Inspect `data/reports/embodied-priority-source-health.json` for raw payloads, IDs, local paths, tokens, cookies, and misleading lifecycle labels. Expected: zero private fields and a truthful result for every cohort source.

- [ ] **Step 8: Commit the operational evidence**

```bash
git add data/reports/embodied-priority-source-health.json .github/workflows/source-audit.yml tests/workflows/source-governance.test.ts tests/static-site-privacy.test.ts tests/monitor-freshness.test.ts CHANGELOG.md src/catalog/product.ts
git commit -m "feat: verify priority sources in shadow"
```
