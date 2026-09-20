# Embodied Source Map and Event Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the governed embodied-data source map to 80–100 entries and close the verified public Event gap from 2025-04-15 through 2026-09-20.

**Architecture:** Add explicit source-map metadata to the first-class `Source` record, seed only reviewed embodied-data sources, and project lifecycle/coverage state through an allowlisted public DTO. Build the backfill from a checked evidence ledger into the existing `Event -> Evidence -> EventDataProfile` model; do not create a parallel timeline fact store.

**Tech Stack:** TypeScript 5.9, Zod 4, Kysely, SQLite/MySQL migrations, Vitest, static HTML export.

**Spec:** `docs/superpowers/specs/2026-09-20-embodied-data-evolution-timeline-design.md`

## Global Constraints

- Public facts require one Tier 1 primary source or two independent Tier 2 sources.
- Aggregators are discovery/heat inputs only and cannot be the only evidence for an Event.
- New sources start as `draft`; this plan does not promote any source to `active`.
- Target 80–100 public source-map entries with a China-first, global-benchmark portfolio; target approximately 60% CN without lowering evidence quality to hit a ratio.
- Never commit raw collector payloads, tokens, cookies, private feeds, local paths, or personal data.
- Preserve `Event` as the only fact node; sources and evidence link to Events.
- Update both `CHANGELOG.md` and `src/catalog/product.ts` for user-visible changes.
- Use `npm`; final verification is `npm run check` and `npm run build`.

## Review Focus

- A seeded source with an invalid map status, empty stage coverage, or unknown substitute slug must fail before export; Task 1 adds these tests.
- Two channels owned by the same organization must not be counted as independent evidence; Task 3 tests `sourceIdentity` de-duplication.
- A 2026 candidate with only an aggregator or self-repeated press copy must remain rejected or pending; Task 3 tests the publication threshold.
- Restricted/manual sources must remain visible without being reported healthy or integrated; Task 4 tests the public projection.
- A source-map count increase must not leak legacy AI sources or retired rows into public output; Task 5 runs the integrity gate.

---

## File Structure

- Create `src/domain/embodied-source-map.ts`: Zod schemas and derived types for public map state and pipeline coverage.
- Create `src/db/migrations/017_embodied_source_map.ts`: persisted map metadata with safe defaults.
- Modify `src/db/types.ts`: add the new source columns.
- Modify `src/catalog/embodied-data/sources.ts`: expand governed source entries and carry map metadata.
- Modify `src/db/seed.ts` and `src/db/repository.ts`: persist catalog-owned metadata without altering runtime state.
- Create `docs/research/2026-09-20-embodied-source-event-ledger.md`: reviewed source/event evidence ledger.
- Modify `src/catalog/embodied-data/events.ts` and `src/catalog/embodied-data/event-evidence.ts`: accepted current-window Events and evidence only.
- Modify `tests/fixtures/embodied-data/launch/event-source-manifest.json`: URL verification record for every evidence row.
- Modify `src/pipeline/static-site/dto.ts`, `src/pipeline/export.ts`, and `src/pipeline/static-site/pages/sources.ts`: allowlisted source-map output.
- Modify `tests/embodied-data-source-schema.test.ts`, `tests/embodied-data-launch-corpus.test.ts`, `tests/static-site-intelligence.test.ts`, and `tests/public-site-integrity.test.ts`: contracts and regression gates.

### Task 1: Persist governed source-map metadata

**Files:**
- Create: `src/domain/embodied-source-map.ts`
- Create: `src/db/migrations/017_embodied_source_map.ts`
- Modify: `src/db/types.ts:8-55`
- Modify: `src/db/seed.ts:695-756`
- Modify: `src/db/repository.ts:180-214`
- Test: `tests/embodied-data-source-schema.test.ts`

**Interfaces:**
- Produces: `SourceMapStatus`, `SourceMapStatusSchema`, `SourcePipelineCoverageSchema`, and persisted `map_status`, `pipeline_stages_json`, `substitute_for_json`, `restriction_note` columns.
- Consumes: `EmbodiedPipelineStageSchema` from `src/domain/embodied-data.ts`.

- [ ] **Step 1: Write the failing schema and migration tests**

```ts
expect(SourceMapStatusSchema.options).toEqual([
  "integrated",
  "pending",
  "restricted",
  "substitute",
]);
for (const name of [
  "map_status",
  "pipeline_stages_json",
  "substitute_for_json",
  "restriction_note",
]) {
  expect(sourceTable?.columns.find((column) => column.name === name)?.isNullable).toBe(false);
}
```

Also add a round-trip assertion that `saveCatalogSource()` updates catalog-owned map fields while preserving `observation_enabled`, `state_json`, run counters, and lifecycle state on an existing source.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/embodied-data-source-schema.test.ts`

Expected: FAIL because `SourceMapStatusSchema` and the four columns do not exist.

- [ ] **Step 3: Add the schema, migration, and persistence mapping**

```ts
export const SourceMapStatusSchema = z.enum([
  "integrated",
  "pending",
  "restricted",
  "substitute",
]);

export const SourcePipelineCoverageSchema = z
  .array(EmbodiedPipelineStageSchema)
  .min(1)
  .transform((values) => [...new Set(values)]);
```

Migration defaults must be `pending`, `[]`, `[]`, and an empty string so restored databases stay readable. Catalog seeding must overwrite these catalog-owned fields but must not overwrite live operational state.

- [ ] **Step 4: Run schema, migration, and seed tests**

Run: `npx vitest run tests/embodied-data-source-schema.test.ts tests/snapshot.test.ts tests/bootstrap.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the source-map contract**

```bash
git add src/domain/embodied-source-map.ts src/db/migrations/017_embodied_source_map.ts src/db/types.ts src/db/seed.ts src/db/repository.ts tests/embodied-data-source-schema.test.ts tests/snapshot.test.ts
git commit -m "feat: persist embodied source map metadata"
```

### Task 2: Research and expand the governed source catalog

**Files:**
- Create: `docs/research/2026-09-20-embodied-source-event-ledger.md`
- Modify: `src/catalog/embodied-data/sources.ts:1-535`
- Modify: `tests/embodied-data-source-schema.test.ts`
- Modify: `tests/fixtures/embodied-data/launch/source-contract-cases.json`

**Interfaces:**
- Consumes: `SourceMapStatus` and `EmbodiedPipelineStage`.
- Produces: 80–100 unique `EmbodiedCatalogSource` rows with explicit coverage and public-map state.

- [ ] **Step 1: Add failing portfolio tests**

```ts
expect(embodiedSourceCatalog.length).toBeGreaterThanOrEqual(80);
expect(embodiedSourceCatalog.length).toBeLessThanOrEqual(100);
expect(new Set(embodiedSourceCatalog.map((source) => source.slug)).size).toBe(
  embodiedSourceCatalog.length,
);
expect(embodiedSourceCatalog.filter((source) => source.region === "CN").length).toBeGreaterThanOrEqual(
  Math.floor(embodiedSourceCatalog.length * 0.55),
);
for (const source of embodiedSourceCatalog) {
  expect(SourceMapStatusSchema.parse(source.mapStatus)).toBe(source.mapStatus);
  expect(SourcePipelineCoverageSchema.parse(source.pipelineStages).length).toBeGreaterThan(0);
  expect(source.owner.trim().length).toBeGreaterThan(1);
  expect(source.robotsPolicy.trim().length).toBeGreaterThan(10);
}
```

Add checks that every `substitute` row names an existing source slug, every `restricted` row has a non-empty restriction note, and only reviewed adapter-backed rows use `integrated`.

- [ ] **Step 2: Run the test and verify the current 36-source failure**

Run: `npx vitest run tests/embodied-data-source-schema.test.ts`

Expected: FAIL because the catalog has 36 rows and lacks map metadata.

- [ ] **Step 3: Build the evidence ledger from primary pages**

For each candidate, record owner, canonical URL, endpoint, region, role, tier, acquisition, category, six-stage coverage, robots/license note, identity hosts, access decision, and verification date. Start with this explicit candidate pool and include a row only after its official page is verified:

```text
CN institutions/policy: SAMR standards portal; MIIT; China Electronics Standardization Institute;
Beijing Humanoid Robot Innovation Center; Shanghai Humanoid Robotics Innovation Center;
Shanghai, Beijing, Shenzhen and Guangzhou embodied-intelligence policy portals.

CN robot/model teams: Galbot; Kepler Exploration Robot; EngineAI; Noetix Robotics;
LimX Dynamics; DroidUp; XPeng Robotics; Tencent Robotics X; ByteDance Seed Robotics;
Alibaba DAMO robotics; Baidu robotics; Shanghai AI Lab InternRobotics; Horizon HoloMotion;
Tsinghua AIR; OpenDriveLab; DEEP Robotics.

CN data/capture providers: DataTang embodied data; Magic Data robotics; PNP Robotics;
Noitom; Manus; PICO motion tracking.

Global teams/infrastructure: Figure AI; 1X; Apptronik; Sanctuary AI;
Boston Dynamics AI Institute; Toyota Research Institute; Tesla AI robotics; Meta FAIR robotics;
NVIDIA Isaac GR00T; Skild AI; Dexterity; Covariant; Generalist AI.

Global datasets/standards/capture: EgoNet; RoboTwin; RoboCasa365; NIST Physical AI;
ISO/TC 299; ITU-T Robot Data Factory; Xsens; SenseGlove; Intel RealSense;
RoboDATA.AI; TRACE Dynamics; Khenda Robotics.
```

If an official endpoint is unavailable, keep the entry `pending`, `restricted`, or `substitute`; do not invent an adapter or mark it integrated.

- [ ] **Step 4: Add 44–64 reviewed rows and extend the contract manifest**

Use `website()`/`github()` only for endpoints that meet their parser contract. Use a `manual`/restricted row for sources that are valuable for the map but do not allow automated access. Keep identity hosts grouped by owner so multiple channels do not imply independent evidence.

- [ ] **Step 5: Run catalog and seed validation**

Run: `npx vitest run tests/embodied-data-source-schema.test.ts tests/catalog.test.ts tests/embodied-data-migration.test.ts`

Expected: PASS with 80–100 governed current-scope sources and all legacy sources retired.

- [ ] **Step 6: Commit the reviewed source map**

```bash
git add docs/research/2026-09-20-embodied-source-event-ledger.md src/catalog/embodied-data/sources.ts tests/embodied-data-source-schema.test.ts tests/fixtures/embodied-data/launch/source-contract-cases.json
git commit -m "feat: expand embodied data source map"
```

### Task 3: Backfill verified Events through the current window

**Files:**
- Modify: `docs/research/2026-09-20-embodied-source-event-ledger.md`
- Modify: `src/catalog/embodied-data/events.ts`
- Modify: `src/catalog/embodied-data/event-evidence.ts`
- Modify: `tests/fixtures/embodied-data/launch/event-source-manifest.json`
- Modify: `tests/embodied-data-launch-corpus.test.ts`

**Interfaces:**
- Consumes: reviewed source slugs from Task 2 and `EventDataProfileSchema`.
- Produces: accepted backfill Events with evidence and a machine-checkable verification manifest.

- [ ] **Step 1: Add failing freshness and evidence-independence tests**

```ts
const currentWindow = embodiedLaunchEvents.filter(
  (event) => event.date >= "2025-04-15T00:00:00.000Z",
);
expect(currentWindow.length).toBeGreaterThan(0);
expect(currentWindow.some((event) => event.date >= "2026-08-01T00:00:00.000Z")).toBe(true);
for (const event of currentWindow) {
  const rows = event.evidenceSlugs.map((slug) => evidenceBySlug.get(slug)!);
  const tier1 = rows.some((row) => row.sourceTier === 1 && row.role === "primary");
  const independentTier2 = new Set(
    rows.filter((row) => row.sourceTier === 2).map((row) => row.sourceIdentity),
  );
  expect(tier1 || independentTier2.size >= 2, event.slug).toBe(true);
}
```

Add a regression case with two different URLs but the same `sourceIdentity`; it must not satisfy the two-Tier-2 gate.

- [ ] **Step 2: Run the corpus test and verify the freshness failure**

Run: `npx vitest run tests/embodied-data-launch-corpus.test.ts`

Expected: FAIL because the newest Event is 2025-04-14.

- [ ] **Step 3: Research the current-window candidate set**

Verify official primary evidence before accepting candidates. The initial review set is: `pi05-open-world-generalization`, `nvidia-groot-dreams-synthetic-data`, `intern-data-a1`, `robotwin-2`, `agibot-world-2026`, `holomotion-retargeting`, `egonet-human-action-data`, `china-embodied-data-generation-standard`, `itu-robot-data-factory`, and `robot-data-factory-reference-architecture`. Record rejected candidates and the rejection reason in the ledger instead of silently dropping them.

- [ ] **Step 4: Add only accepted Events, evidence rows, and profiles**

Every Event must contain fact, interpretation, next watch, recommended action, one or more pipeline stages, a strict `EventDataProfile`, and evidence slugs. Do not copy announcement prose; write bounded factual summaries and preserve `claimed`/`verified`/`conflicting` state.

- [ ] **Step 5: Regenerate and verify the evidence manifest**

The manifest must contain exactly one row for each evidence record:

```json
{
  "evidenceSlug": "itu-robot-data-factory-work-item",
  "eventSlug": "itu-robot-data-factory",
  "url": "https://www.itu.int/ITU-T/workprog/wp_item.aspx?isn=24285",
  "verifiedAt": "2026-09-20T00:00:00.000Z"
}
```

- [ ] **Step 6: Run corpus, readiness, and relevance tests**

Run: `npx vitest run tests/embodied-data-launch-corpus.test.ts tests/embodied-data-relevance.test.ts tests/embodied-data-quality.test.ts tests/readiness.test.ts`

Expected: PASS; every public Event clears the publication threshold and current-window freshness gate.

- [ ] **Step 7: Commit the verified backfill**

```bash
git add docs/research/2026-09-20-embodied-source-event-ledger.md src/catalog/embodied-data/events.ts src/catalog/embodied-data/event-evidence.ts tests/fixtures/embodied-data/launch/event-source-manifest.json tests/embodied-data-launch-corpus.test.ts
git commit -m "feat: backfill embodied data events"
```

### Task 4: Publish source lifecycle, coverage, and gaps

**Files:**
- Modify: `src/pipeline/static-site/dto.ts:160-185,379-401`
- Modify: `src/pipeline/export.ts:140-170,285-335`
- Modify: `src/pipeline/static-site/pages/sources.ts`
- Modify: `src/pipeline/static-site/intelligence.ts`
- Modify: `tests/fixtures/embodied-site-model.ts`
- Test: `tests/static-site-intelligence.test.ts`
- Test: `tests/embodied-data-public-dto.test.ts`

**Interfaces:**
- Produces: `PublicSource.mapStatus`, `pipelineStages`, `substituteFor`, `restrictionNote`, plus `SourceCoverageGap[]` derived from the six-stage/category matrix.
- Consumes: persisted source-map fields from Task 1.

- [ ] **Step 1: Write failing DTO and page tests**

```ts
expect(publicSource).toMatchObject({
  mapStatus: "pending",
  pipelineStages: ["acquisition-route"],
  substituteFor: [],
});
expect(sourcesPage).toContain("已接入");
expect(sourcesPage).toContain("待接入");
expect(sourcesPage).toContain("受限");
expect(sourcesPage).toContain("替代来源");
expect(sourcesPage).toContain("覆盖缺口");
```

Add a restricted fixture and assert that it renders as restricted, with `healthStatus: "unchecked"`, never as healthy or integrated.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run tests/embodied-data-public-dto.test.ts tests/static-site-intelligence.test.ts`

Expected: FAIL because the public DTO and page do not expose map state or gaps.

- [ ] **Step 3: Project allowlisted metadata and compute gaps**

Parse JSON fields with safe empty-array fallbacks. A gap is a pipeline-stage/category cell with no non-restricted current-scope source; it is a computed summary, not a fake Source row.

- [ ] **Step 4: Render filters, status groups, and coverage summary**

Keep all source cards server-rendered. Add region, stage, and map-state filters as progressive enhancement; ensure the default HTML lists every public source and labels restricted/manual entries accurately.

- [ ] **Step 5: Run static-site and privacy tests**

Run: `npx vitest run tests/static-site-intelligence.test.ts tests/static-site-accessibility.test.ts tests/static-site-privacy.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the public source map**

```bash
git add src/pipeline/static-site/dto.ts src/pipeline/export.ts src/pipeline/static-site/pages/sources.ts src/pipeline/static-site/intelligence.ts tests/fixtures/embodied-site-model.ts tests/static-site-intelligence.test.ts tests/embodied-data-public-dto.test.ts
git commit -m "feat: publish governed source coverage"
```

### Task 5: Update release evidence and run the full gate

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `src/catalog/product.ts`
- Modify: `tests/public-site-integrity.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: audited user-visible release notes and final build evidence.

- [ ] **Step 1: Update integrity expectations without hard-coding an accidental count**

Assert the exported source count is in `[80, 100]`, the exported Event count equals `embodiedLaunchEvents.length`, the latest Event is at least 2026-08-01, and public files contain no legacy AI route or domain names.

- [ ] **Step 2: Update both changelog sources**

Record source-map lifecycle/coverage visibility and the verified 2025-04 to 2026-09 backfill under `[Unreleased]` and the website `unreleased` entry. Do not claim the 12–18 focus adapters are complete; that belongs to Plan 3.

- [ ] **Step 3: Run the full repository gate**

Run: `npm run check`

Expected: lint, typecheck, all tests, export, and public validation pass.

- [ ] **Step 4: Build and inspect public artifacts**

Run: `npm run build`

Inspect: `dist/sources/index.html`, `dist/data/sources.json`, `dist/data/events.json`, `dist/feed.xml`, and `dist/changelog/index.html`. Confirm source state labels, latest accepted Event, evidence links, and zero private fields.

- [ ] **Step 5: Commit the completed data/map slice**

```bash
git add CHANGELOG.md src/catalog/product.ts tests/public-site-integrity.test.ts
git commit -m "chore: document embodied source expansion"
```

