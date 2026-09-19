# Embodied Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reversible domain foundation for the embodied-data vertical without changing the current public site: controlled vocabularies, content scope, Event DataProfile persistence, deterministic relevance assessment, golden fixtures, snapshot round-trip, and a private dual-run preview.

**Architecture:** Keep `Event` as the only fact node. Add `content_scope` to existing factual/catalog entities and store fast-evolving embodied-data dimensions in a schema-validated `event_data_profiles` table. A deterministic assessor produces `include`, `review`, or `reject` recommendations for a private preview; it does not publish, delete, or reclassify current data.

**Tech Stack:** Node.js 22+, TypeScript 5.9, Zod 4, Kysely 0.28, SQLite, Vitest, npm.

**Spec:** `docs/specs/2026-09-19-embodied-data-intelligence/DEVELOPMENT-GUIDE.md`

## Global Constraints

- Use English for code, identifiers, comments, commit messages, and code blocks. Use Chinese for product specifications and product copy.
- Use `npm`; add no runtime dependency in this package.
- SQLite is the verified default. Do not claim MySQL support without a real integration test.
- Current rows default to `legacy-ai`; no current Event, Source, Signal, Actor, snapshot row, or public route is deleted in this package.
- The preview is private and writes under ignored `var/`; it must not modify `dist/`, `data/snapshot/v1.json`, or the public DTO set.
- Every stored DataProfile passes a strict Zod schema. Invalid JSON is an error, not a partial profile.
- `Event` remains the fact node. DataProfile contains dimensions and impact, not copied source text or new factual claims.
- Existing evidence, privacy, SSRF, source lifecycle, and public allowlist boundaries remain unchanged.
- Scheduled refresh, audit, quality, and monitor workflows are paused; verification in this package is local only.
- Each task follows red-green-refactor and ends with an independently reviewable commit.

---

## File Structure

### New files

- `docs/specs/2026-09-19-embodied-data-intelligence/PRD.md` — product boundary and acceptance criteria for the foundation package.
- `docs/specs/2026-09-19-embodied-data-intelligence/SYSTEM.md` — schema, data flow, compatibility, and rollback design.
- `docs/specs/2026-09-19-embodied-data-intelligence/TEST.md` — unit, migration, snapshot, preview, and non-goal verification matrix.
- `docs/specs/2026-09-19-embodied-data-intelligence/TASKS.md` — evidence-backed task checklist for this package only.
- `src/domain/embodied-data.ts` — controlled vocabularies and strict DataProfile schema.
- `src/domain/embodied-data-relevance.ts` — deterministic preview-only relevance assessment.
- `src/db/migrations/012_embodied_data_foundation.ts` — additive scope columns and `event_data_profiles` table.
- `src/pipeline/embodied-data-preview.ts` — read-only preview model builder and file writer.
- `src/cli/preview-embodied-data.ts` — CLI entry point for the private preview.
- `tests/embodied-data-domain.test.ts` — vocabulary and DataProfile schema tests.
- `tests/embodied-data-schema.test.ts` — migration and Repository contract tests.
- `tests/embodied-data-relevance.test.ts` — golden relevance cases.
- `tests/embodied-data-preview.test.ts` — private preview and no-public-mutation tests.
- `tests/fixtures/embodied-data/relevance-cases.json` — explicit include/review/reject examples.
- `tests/fixtures/embodied-data/data-profiles.json` — three valid profile fixtures and one invalid fixture.

### Modified files

- `tests/scout.test.ts` — isolate the Scout diversity test from versioned seed content.
- `src/db/types.ts` — add scope columns and `EventDataProfileTable`.
- `src/db/repository.ts` — add typed DataProfile and scoped Event methods.
- `src/pipeline/snapshot.ts` — persist and restore scope plus DataProfile rows additively.
- `tests/snapshot.test.ts` — prove backward compatibility and DataProfile round-trip.
- `package.json` — add `preview:embodied`.
- `CHANGELOG.md` — describe the unreleased, non-public foundation.
- `src/catalog/product.ts` — mirror the Unreleased capability and boundary.

---

### Task 1: Stabilize the Baseline Scout Test

**Files:**

- Modify: `tests/scout.test.ts:47-90`

**Interfaces:**

- Consumes: `runScout(db, limit)` and current `seedDatabase` behavior.
- Produces: a deterministic integration test whose result does not depend on the kinds already present in the versioned snapshot.

- [ ] **Step 1: Re-run the current failing test and capture the baseline**

Run:

```bash
npm test -- --run tests/scout.test.ts -t "fills distinct opportunity kinds"
```

Expected: FAIL at `tests/scout.test.ts:89` with `expected 3 to be greater than or equal to 4`.

- [ ] **Step 2: Isolate the test from seeded Scout rows**

After `seedDatabase(db)`, archive all seeded Scout rows before reading `initiallyPublished`:

```ts
await db
  .updateTable("scout_insights")
  .set({ status: "archived", published_at: null })
  .execute();
```

Add `vi` to the Vitest import, insert six recent high-scoring published Event fixtures with unique IDs and slugs, and restore real timers in `afterEach`. Replace direct wall-clock dependence with:

```ts
const fixtureNow = new Date("2026-09-19T00:00:00.000Z");
vi.useFakeTimers();
vi.setSystemTime(fixtureNow);
await db.insertInto("events").values(
  Array.from({ length: 6 }, (_, index) => ({
    id: randomUUID(),
    slug: `scout-diversity-${index}`,
    title: `Scout diversity event ${index}`,
    fact_summary: "An official source published a bounded workflow update with measurable results.",
    summary: "The fixture provides a stable high-value event for deterministic Scout kind selection.",
    technical_insight: "The workflow has explicit inputs, outputs, controls, and failure boundaries.",
    industry_insight: "The change can affect a real operating workflow and merits a bounded validation.",
    future_outlook: "Verify adoption, cost, completion rate, and human takeover frequency.",
    business_value: "Run a reversible test with success, cost, and stop thresholds.",
    category: "test-fixture",
    company: `Fixture Company ${index}`,
    keywords_json: JSON.stringify(["fixture", "workflow", "validation"]),
    confidence_score: 92,
    heat_score: 90,
    impact_score: 94,
    value_score: 93,
    score_factors_json: JSON.stringify({ independentSources: 2, platformBreadth: 2 }),
    status: "published",
    featured: 0,
    manual_override: 0,
    happened_at: new Date(fixtureNow.getTime() - index * 60_000).toISOString(),
    published_at: fixtureNow.toISOString(),
    created_at: fixtureNow.toISOString(),
    updated_at: fixtureNow.toISOString(),
  })),
).execute();
```

- [ ] **Step 3: Tighten the assertion to the isolated behavior**

Keep the two `runScout(db, 3)` calls and assert the resulting published kind set is exactly:

```ts
expect(publishedKinds).toEqual(
  new Set(["venture", "media", "work", "learning", "artifact", "influence"]),
);
```

- [ ] **Step 4: Verify the targeted and complete Scout test file**

Run:

```bash
npm test -- --run tests/scout.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/scout.test.ts
git commit -m "test: isolate scout diversity fixture"
```

---

### Task 2: Split the Approved Guide into an Active Spec Package

**Files:**

- Create: `docs/specs/2026-09-19-embodied-data-intelligence/PRD.md`
- Create: `docs/specs/2026-09-19-embodied-data-intelligence/SYSTEM.md`
- Create: `docs/specs/2026-09-19-embodied-data-intelligence/TEST.md`
- Create: `docs/specs/2026-09-19-embodied-data-intelligence/TASKS.md`
- Modify: `docs/specs/2026-09-19-embodied-data-intelligence/DEVELOPMENT-GUIDE.md`

**Interfaces:**

- Consumes: approved decisions in `DEVELOPMENT-GUIDE.md`.
- Produces: the docs-first contract used by Tasks 3-8.

- [ ] **Step 1: Create the PRD**

Write the following explicit requirements:

```markdown
# PRD：具身数据认知系统领域基础

## 用户与问题

首要用户是具身数据生产运营团队。首个实施包只建立技术路线与行业标准所需的领域基础，不切换公开站。

## 目标

- 为 Event、Signal、Source 和 Actor 建立可审计 content scope。
- 为 Event 保存严格校验的具身数据 DataProfile。
- 用确定性规则给出 include / review / reject 预览建议。
- 通过私有预览验证现有内容迁移规模，不修改公开 DTO。

## 非目标

- 不删除通用 AI 数据。
- 不切换首页、导航、主线或 Pages。
- 不自动发布具身 Event。
- 不宣称 MySQL 兼容。

## 验收

- 旧快照可恢复，旧数据默认 legacy-ai。
- DataProfile 可写入、读取、快照和恢复。
- golden set 全部得到预期结论。
- 私有预览不修改 dist 和公开指纹。
```

- [ ] **Step 2: Create SYSTEM.md**

Document the additive migration, `event_data_profiles` ownership, strict parse-on-write/read rule, backward-compatible snapshot extension, preview data flow, and rollback order: stop preview -> drop profile table -> drop scope columns.

- [ ] **Step 3: Create TEST.md**

List exact commands and evidence:

```markdown
npm test -- --run tests/embodied-data-domain.test.ts
npm test -- --run tests/embodied-data-schema.test.ts
npm test -- --run tests/embodied-data-relevance.test.ts
npm test -- --run tests/snapshot.test.ts
npm test -- --run tests/embodied-data-preview.test.ts
npm run preview:embodied
npm run check
npm run build
```

- [ ] **Step 4: Create TASKS.md**

Add one unchecked item for each Task 1-8 in this plan. State that a box can be checked only after its named tests and commit exist.

- [ ] **Step 5: Link the package from the guide**

Add a “首个实施包” link block near the top of `DEVELOPMENT-GUIDE.md` linking PRD, SYSTEM, TEST, TASKS, and this implementation plan.

- [ ] **Step 6: Verify no incomplete markers or contradictions**

Run:

```bash
rg -n "\\bT[B]D\\b|\\bTO[D]O\\b|待(补充|确认)|place(holder)" docs/specs/2026-09-19-embodied-data-intelligence
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add docs/specs/2026-09-19-embodied-data-intelligence docs/superpowers/plans/2026-09-19-embodied-data-foundation.md
git commit -m "docs: define embodied data foundation package"
```

---

### Task 3: Add Controlled Vocabularies and the DataProfile Schema

**Files:**

- Create: `src/domain/embodied-data.ts`
- Create: `tests/embodied-data-domain.test.ts`
- Create: `tests/fixtures/embodied-data/data-profiles.json`

**Interfaces:**

- Produces:
  - `ContentScopeSchema` and `ContentScope`
  - `EmbodiedPipelineStageSchema` and `EmbodiedPipelineStage`
  - `EventDataProfileSchema` and `EventDataProfile`
  - `parseEventDataProfile(value: unknown): EventDataProfile`

- [ ] **Step 1: Write strict schema tests**

Test that:

```ts
expect(ContentScopeSchema.parse("embodied-data")).toBe("embodied-data");
expect(ContentScopeSchema.parse("legacy-ai")).toBe("legacy-ai");
expect(() => ContentScopeSchema.parse("robotics-news")).toThrow();
expect(EventDataProfileSchema.parse(validFixture)).toEqual(validFixture);
expect(() => EventDataProfileSchema.parse(invalidFixture)).toThrow();
```

The invalid fixture must contain an unsupported modality and an empty `pipelineStages` array.

- [ ] **Step 2: Verify the test fails**

Run:

```bash
npm test -- --run tests/embodied-data-domain.test.ts
```

Expected: FAIL because `src/domain/embodied-data.ts` does not exist.

- [ ] **Step 3: Implement the controlled vocabularies**

Use exact kebab-case values:

```ts
export const ContentScopeSchema = z.enum(["legacy-ai", "embodied-data"]);

export const EmbodiedPipelineStageSchema = z.enum([
  "demand-definition",
  "acquisition-route",
  "multimodal-capture",
  "production-operations",
  "data-engineering-standards",
  "quality-training-feedback",
]);
```

Add strict enums for embodiments, tasks, modalities, acquisition methods, and evidence status. The acquisition methods are `teleoperation`, `wearable`, `autonomous`, `simulation`, `synthetic`, `internet-video`, `manual-demonstration`, and `hybrid`.

- [ ] **Step 4: Implement the strict DataProfile schema**

Use this stable interface:

```ts
export const EventDataProfileSchema = z
  .object({
    pipelineStages: z.array(EmbodiedPipelineStageSchema).min(1),
    scenarios: z.array(z.string().trim().min(2).max(80)).max(12),
    embodiments: z.array(EmbodimentSchema).max(12),
    tasks: z.array(EmbodiedTaskSchema).max(16),
    modalities: z.array(DataModalitySchema).max(20),
    acquisitionMethods: z.array(AcquisitionMethodSchema).max(8),
    dataFormats: z.array(z.string().trim().min(1).max(80)).max(16),
    standards: z.array(z.string().trim().min(2).max(120)).max(16),
    scaleClaims: z
      .array(
        z
          .object({
            metric: z.string().trim().min(2).max(80),
            value: z.number().finite().nonnegative(),
            unit: z.string().trim().min(1).max(40),
            sourceUrl: z.string().url(),
          })
          .strict(),
      )
      .max(12),
    qualityMetrics: z.array(z.string().trim().min(2).max(120)).max(16),
    costSignals: z.array(z.string().trim().min(2).max(160)).max(12),
    deliveryImpact: z.string().trim().min(20).max(800),
    evidenceStatus: z.enum(["claimed", "verified", "conflicting"]),
  })
  .strict();
```

- [ ] **Step 5: Add three valid fixtures**

Create one profile each for teleoperation collection, simulation/synthetic generation, and quality/training feedback. Each fixture must use only public example URLs and must not contain customer names or private metrics.

- [ ] **Step 6: Verify the domain tests**

Run:

```bash
npm test -- --run tests/embodied-data-domain.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/embodied-data.ts tests/embodied-data-domain.test.ts tests/fixtures/embodied-data/data-profiles.json
git commit -m "feat: define embodied data profile schema"
```

---

### Task 4: Add the Additive Database Migration and Types

**Files:**

- Create: `src/db/migrations/012_embodied_data_foundation.ts`
- Modify: `src/db/types.ts`
- Create: `tests/embodied-data-schema.test.ts`

**Interfaces:**

- Consumes: `ContentScope` and `EventDataProfile` from Task 3.
- Produces:
  - `content_scope` on `sources`, `signals`, `events`, and `actors`
  - `EventDataProfileTable`
  - `event_data_profiles` in `DatabaseSchema`

- [ ] **Step 1: Write the migration contract test**

After `migrateToLatest`, query SQLite metadata and assert all four columns default to `legacy-ai`. Insert an Event without specifying `content_scope` and assert it reads as `legacy-ai`. Insert an `event_data_profiles` row and assert the Event foreign key cascades on deletion.

- [ ] **Step 2: Verify the migration test fails**

Run:

```bash
npm test -- --run tests/embodied-data-schema.test.ts
```

Expected: FAIL because migration `012` and `event_data_profiles` do not exist.

- [ ] **Step 3: Add the migration**

In `up`:

```ts
for (const table of ["sources", "signals", "events", "actors"] as const) {
  await db.schema
    .alterTable(table)
    .addColumn("content_scope", "varchar(40)", (column) =>
      column.notNull().defaultTo("legacy-ai"),
    )
    .execute();
}
```

Create `event_data_profiles` with:

```text
event_id varchar(36) primary key references events(id) on delete cascade
profile_json text not null
schema_version integer not null default 1
created_at varchar(40) not null
updated_at varchar(40) not null
```

In `down`, drop `event_data_profiles` first, then drop the four scope columns in reverse order.

- [ ] **Step 4: Update TypeScript database types**

Add `content_scope: Generated<ContentScope>` to the four table interfaces. Add:

```ts
export interface EventDataProfileTable {
  event_id: string;
  profile_json: string;
  schema_version: Generated<number>;
  created_at: string;
  updated_at: string;
}
```

Register `event_data_profiles` in `DatabaseSchema` and export selectable/insertable aliases.

- [ ] **Step 5: Verify migration and typecheck**

Run:

```bash
npm test -- --run tests/embodied-data-schema.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations/012_embodied_data_foundation.ts src/db/types.ts tests/embodied-data-schema.test.ts
git commit -m "feat: add embodied data persistence foundation"
```

---

### Task 5: Add Repository Contracts and Snapshot Round-Trip

**Files:**

- Modify: `src/db/repository.ts`
- Modify: `src/pipeline/snapshot.ts`
- Modify: `tests/embodied-data-schema.test.ts`
- Modify: `tests/snapshot.test.ts`

**Interfaces:**

- Consumes: migration and `EventDataProfileSchema`.
- Produces:
  - `Repository.upsertEventDataProfile(eventId, profile)`
  - `Repository.getEventDataProfile(eventId)`
  - `Repository.listEventsByContentScope(scope, status?)`
  - backward-compatible snapshot fields `contentScope` and `eventDataProfiles`

- [ ] **Step 1: Write failing Repository tests**

Assert:

```ts
await repository.upsertEventDataProfile(event.id, profile);
expect(await repository.getEventDataProfile(event.id)).toEqual(profile);
expect(await repository.listEventsByContentScope("legacy-ai", "published")).toContainEqual(
  expect.objectContaining({ id: event.id }),
);
```

Also pass invalid profile input through a type escape and assert `upsertEventDataProfile` rejects before writing.

- [ ] **Step 2: Verify Repository tests fail**

Run:

```bash
npm test -- --run tests/embodied-data-schema.test.ts
```

Expected: FAIL because the methods do not exist.

- [ ] **Step 3: Implement Repository methods**

Parse with `EventDataProfileSchema` before serialization and after deserialization. Upsert by `event_id`, preserve `created_at`, update `updated_at`, and set `schema_version` to `1`.

- [ ] **Step 4: Write failing snapshot tests**

Extend `tests/snapshot.test.ts` to:

1. set one Event to `embodied-data`;
2. save a DataProfile;
3. write the snapshot;
4. restore into a fresh database;
5. assert scope and profile equality;
6. restore an old snapshot object without the new fields and assert all rows remain `legacy-ai` with no profiles.

- [ ] **Step 5: Extend the snapshot additively**

Keep `SNAPSHOT_SCHEMA_VERSION = 1` because the extension is optional and backward-compatible. Add:

```ts
eventDataProfiles?: Array<{
  eventSlug: string;
  profile: EventDataProfile;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}>;
```

Write `contentScope` for Source, Signal, and Event rows. On restore, use `legacy-ai` when the field is absent. Validate every restored profile with `EventDataProfileSchema` and resolve Event IDs by slug.

- [ ] **Step 6: Verify Repository and snapshot tests**

Run:

```bash
npm test -- --run tests/embodied-data-schema.test.ts tests/snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/repository.ts src/pipeline/snapshot.ts tests/embodied-data-schema.test.ts tests/snapshot.test.ts
git commit -m "feat: persist embodied data profiles in snapshots"
```

---

### Task 6: Add the Relevance Golden Set and Deterministic Assessor

**Files:**

- Create: `src/domain/embodied-data-relevance.ts`
- Create: `tests/embodied-data-relevance.test.ts`
- Create: `tests/fixtures/embodied-data/relevance-cases.json`

**Interfaces:**

- Produces:

```ts
export interface EmbodiedDataRelevanceInput {
  title: string;
  summary: string;
  technicalInsight: string;
  industryInsight: string;
  businessValue: string;
  category: string;
  keywords: string[];
}

export interface EmbodiedDataRelevanceAssessment {
  decision: "include" | "review" | "reject";
  matchedStages: EmbodiedPipelineStage[];
  reasons: string[];
}

export function assessEmbodiedDataRelevance(
  input: EmbodiedDataRelevanceInput,
): EmbodiedDataRelevanceAssessment;
```

- [ ] **Step 1: Create nine explicit golden cases**

The fixture contains:

- Include: teleoperation dataset release; robot data schema/standard; collection quality study with training effect.
- Review: humanoid fleet announcement mentioning data but no production detail; VLA paper with unclear data contribution; data-company financing with no verified capacity detail.
- Reject: general LLM release; robot product launch without data impact; generic AI funding round.

Each case includes complete input, expected decision, and expected matched stages.

- [ ] **Step 2: Write the table-driven test**

Load the JSON and assert exact decision and stage set for all nine cases. Add a test that reasons use stable machine codes, not generated prose.

- [ ] **Step 3: Verify the test fails**

Run:

```bash
npm test -- --run tests/embodied-data-relevance.test.ts
```

Expected: FAIL because the assessor does not exist.

- [ ] **Step 4: Implement a conservative assessor**

Normalize NFKC text and require both an embodied anchor and a data-production anchor for `include`. Map evidence to stages with explicit term sets. Use `review` when both domains are present but fewer than two distinct data-production signals exist. Use `reject` when either domain is absent.

Stable reason codes:

```text
embodied_anchor_missing
data_pipeline_anchor_missing
data_impact_too_thin
pipeline_stage_matched
embodied_data_scope_matched
```

Do not inspect Source authority or publish status in this pure function.

- [ ] **Step 5: Verify golden tests**

Run:

```bash
npm test -- --run tests/embodied-data-relevance.test.ts
```

Expected: 9 fixture cases and the reason-code test pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/embodied-data-relevance.ts tests/embodied-data-relevance.test.ts tests/fixtures/embodied-data/relevance-cases.json
git commit -m "feat: assess embodied data relevance"
```

---

### Task 7: Add the Private Dual-Run Preview

**Files:**

- Create: `src/pipeline/embodied-data-preview.ts`
- Create: `src/cli/preview-embodied-data.ts`
- Create: `tests/embodied-data-preview.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: scoped Event queries, stored DataProfiles, and `assessEmbodiedDataRelevance`.
- Produces:

```ts
export interface EmbodiedDataPreview {
  schemaVersion: 1;
  generatedAt: string;
  mode: "read-only-preview";
  counts: { total: number; include: number; review: number; reject: number; profiled: number };
  items: Array<{
    eventId: string;
    slug: string;
    title: string;
    status: string;
    currentScope: ContentScope;
    recommendedDecision: "include" | "review" | "reject";
    matchedStages: EmbodiedPipelineStage[];
    reasons: string[];
    hasProfile: boolean;
  }>;
}

export async function buildEmbodiedDataPreview(
  db: Kysely<DatabaseSchema>,
  generatedAt?: string,
): Promise<EmbodiedDataPreview>;
```

- [ ] **Step 1: Write failing preview tests**

Use an in-memory database with one include, one review, and one reject Event. Assert exact counts, stable ordering by slug, `mode: "read-only-preview"`, and no raw Signal payload in serialized output.

Capture a public content fingerprint before and after building/writing the preview and assert equality. Assert the output path is under a temporary directory in the test.

- [ ] **Step 2: Verify the test fails**

Run:

```bash
npm test -- --run tests/embodied-data-preview.test.ts
```

Expected: FAIL because the preview builder does not exist.

- [ ] **Step 3: Implement the preview builder**

Read Event rows without mutation, convert fields to `EmbodiedDataRelevanceInput`, load profile presence in one query, assess every Event, sort items by slug, and return only allowlisted fields.

- [ ] **Step 4: Implement the CLI**

Use bootstrap restore, build the preview, and write formatted JSON to `var/embodied-data-preview.json`. Print only output path and counts. Add:

```json
"preview:embodied": "tsx src/cli/preview-embodied-data.ts"
```

- [ ] **Step 5: Verify tests and run the real preview**

Run:

```bash
npm test -- --run tests/embodied-data-preview.test.ts
npm run preview:embodied
```

Expected: tests pass; the CLI writes `var/embodied-data-preview.json`; `git status --short` does not show the preview file.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/embodied-data-preview.ts src/cli/preview-embodied-data.ts tests/embodied-data-preview.test.ts package.json package-lock.json
git commit -m "feat: add embodied data migration preview"
```

---

### Task 8: Record the Experimental Foundation and Run Full Verification

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `src/catalog/product.ts`
- Modify: `docs/specs/2026-09-19-embodied-data-intelligence/TASKS.md`

**Interfaces:**

- Consumes: verified results from Tasks 1-7.
- Produces: synchronized Unreleased product history and completion evidence for the first package.

- [ ] **Step 1: Update both Changelog sources**

Add the same user-facing fact in both files:

```text
新增具身数据方向的实验性领域基础：受控词表、Event DataProfile、可审计 content scope 和只读迁移预览。公开站、现有数据和发布规则尚未切换。
```

Do not change `productVersion`. Add the capability as `experimental` with evidence pointing to the schema, migration, golden tests, and private preview.

- [ ] **Step 2: Run targeted verification**

Run:

```bash
npm test -- --run tests/scout.test.ts tests/embodied-data-domain.test.ts tests/embodied-data-schema.test.ts tests/embodied-data-relevance.test.ts tests/snapshot.test.ts tests/embodied-data-preview.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 3: Run full repository verification**

Run:

```bash
npm run check
npm run build
```

Expected: both commands exit 0. The known Scout baseline failure must be gone.

- [ ] **Step 4: Inspect the private preview**

Run:

```bash
npm run preview:embodied
git status --short
```

Expected: preview JSON exists under ignored `var/`; only intended tracked files appear in Git status.

- [ ] **Step 5: Check completed TASKS items only after evidence exists**

Mark Tasks 1-8 complete in `TASKS.md` and add the exact verification commands plus the final commit hashes.

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md src/catalog/product.ts docs/specs/2026-09-19-embodied-data-intelligence/TASKS.md
git commit -m "docs: record embodied data foundation"
```

- [ ] **Step 7: Final diff review**

Run:

```bash
git status --short
git diff HEAD~8..HEAD --stat
git log -8 --oneline
```

Expected: clean worktree; eight focused implementation commits after the plan commit; no public-site switch and no current data deletion.
