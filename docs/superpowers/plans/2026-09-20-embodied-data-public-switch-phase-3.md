# Embodied Data Public Switch Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current generic-AI catalog and current public corpus with an auditable embodied-data source map, a 36-event launch corpus, reusable data-production objects, an evidence-backed peer matrix, and a reversible repository snapshot migration.

**Architecture:** Keep `Event` as the only fact node. Store editorial launch data in typed embodied-data catalog modules, validate every record before persistence, and migrate from the versioned operational snapshot instead of editing it by hand. Retain generic-AI provenance as `legacy-ai` / `retired`, but make embodied-data scope the default for repository queries, collection selection, export inputs, and seed catalogs.

**Tech Stack:** Node.js 22+, TypeScript 5.9, Zod 4, Kysely 0.28, SQLite, Vitest, npm.

**Spec:** `docs/superpowers/specs/2026-09-20-embodied-data-public-switch-design.md`

## Global Constraints

- Use English for code, identifiers, comments, commit messages, and code blocks. Use Chinese for public product copy.
- Use `npm`; add no runtime dependency.
- Preserve `Event` as the only fact node. Dataset, Standard, CollectionMethod, Actor, and capability rows must reference Event or Evidence instead of copying new facts.
- Do not bulk-promote the private preview results. Each launch Event must be an explicit reviewed catalog record.
- Every launch Event needs one Tier 1 source, or two independent Tier 2 sources. A publisher claim remains `claimed` until independent evidence exists.
- Every new collector remains `shadow`; curated manual evidence may support a published Event without promoting its collector.
- Keep existing generic-AI operational rows for provenance. Mark Sources `retired`, keep factual rows `legacy-ai`, and exclude them from default product paths.
- Do not hand-edit `data/snapshot/v1.json`; regenerate it through the migration and snapshot commands.
- SQLite is the verified database. Do not claim MySQL compatibility.
- Each behavior change follows red-green-refactor and ends in a reviewable commit.

## Review Focus

- A clean database contains only the embodied current catalog; a restored old snapshot retains legacy provenance without exposing it through default queries.
- Re-running seed or migration is idempotent: stable IDs, relations, lifecycle state, and object counts do not drift.
- Evidence URLs are HTTPS, credential-free, query-free, and point to the original publisher, repository, paper, standard, or official project page.
- Source identity deduplication uses source, author, and media group identities, not authority or role.
- A failed migration does not replace the versioned snapshot, and a restore into an empty SQLite database reproduces the same public fingerprint.
- The launch corpus covers all six pipeline stages and the full 2022–2026 window without using generic robotics/model news as filler.

---

## Launch Corpus Contract

Implement exactly 36 reviewed launch candidates. A candidate may be withheld only when its primary source fails validation; do not substitute an unreviewed item. The final published count must remain between 30 and 50.

| Group | Required launch milestones |
| --- | --- |
| Task and benchmark definition | BEHAVIOR-1K; LIBERO; RoboCasa; CALVIN; DROID evaluation protocol; RoboMIND benchmark |
| Acquisition routes | ALOHA/ACT; Mobile ALOHA; GELLO; Universal Manipulation Interface; iPhUmi; AutoRT |
| Multimodal capture | RH20T; DROID; RoboSet; HoloAssist; Ego-Exo4D; visual-tactile capture milestone from RoboMIND |
| Production operations | BridgeData V2; DROID distributed collection; AgiBot World Alpha; AgiBot World Beta; RoboMIND 1.0; RoboMIND 1.2 |
| Engineering and standards | RLDS; Open X-Embodiment; LeRobot initial release; LeRobotDataset v3; ROS 2 rosbag2/MCAP; ARIO unified representation |
| Quality and training feedback | RT-1 data scaling result; RT-X cross-embodiment result; Octo; OpenVLA; pi0; GO-1 open-source training feedback |

Primary evidence must come from the official project site, official repository, original paper, standards body, or publisher. The initial source families include DROID, UC Berkeley RAIL, Google DeepMind/Open X-Embodiment, Hugging Face LeRobot, OpenDriveLab/AgiBot World, Open X-Humanoid/RoboMIND, Stanford UMI, GELLO, ALOHA/ACT, NVIDIA Isaac, ROS 2, and MCAP.

The peer matrix contains these 15 evidence targets:

- China: AgiBot, Open X-Humanoid/RoboMIND, Galaxea AI, Unitree Robotics, Fourier Intelligence, UBTECH, RobotEra, Astribot, Nexdata, and DISCOVER Robotics.
- Global: Hugging Face LeRobot, NVIDIA Isaac, Google DeepMind Robotics, the DROID consortium, and Physical Intelligence.

Only organizations with at least one valid capability claim enter the public matrix. Unsupported cells remain empty; do not infer a capability or calculate an overall score.

---

### Task 1: Freeze the Migration Baseline and Recovery Manifest

**Files:**

- Create: `data/migrations/embodied-data-public-switch-baseline.json`
- Create: `src/pipeline/embodied-data-migration.ts`
- Create: `src/cli/migrate-embodied-data.ts`
- Create: `tests/embodied-data-migration.test.ts`
- Modify: `package.json`

**Interfaces:**

- Produces: `EmbodiedDataMigrationBaselineSchema` and `readEmbodiedDataMigrationBaseline(path)`.
- Produces: `planEmbodiedDataMigration(db, baseline)` and `applyEmbodiedDataMigration(db, baseline)`.
- CLI: `npm run migrate:embodied -- --dry-run` and `npm run migrate:embodied -- --apply`.

- [ ] **Step 1: Write the failing baseline schema and dry-run tests**

Assert the manifest contains:

```json
{
  "schemaVersion": 1,
  "baseGitSha": "8ce4b02dec9394d36e4461f0ba55b8041ab233cb",
  "snapshotSha256": "3442b18e741e04efcb6ed652ae5f4b9d2843e3dab460452eeb3e68a5700f799b",
  "publicFingerprint": "a1ab17715e98c2ca7ca694eb3364c6776a1d6db0d057243ac57cc76167982428",
  "pagesRunId": 35498249142,
  "pagesUrl": "https://susuyan.github.io/eai-pulse/"
}
```

Also assert the recorded snapshot counts for `sources=417`, `signals=17071`, `events=4421`, `scoutInsights=45`, and the eight empty embodied-object arrays. The dry run must return planned current, legacy, retired, inserted, updated, and relation counts without changing the database.

- [ ] **Step 2: Run the focused test and observe RED**

```bash
npm test -- --run tests/embodied-data-migration.test.ts
```

Expected: FAIL because the manifest, planner, and CLI do not exist.

- [ ] **Step 3: Implement strict manifest parsing and transactional planning**

Use Zod `.strict()` schemas. `applyEmbodiedDataMigration` must run in one Kysely transaction and return the same count shape as the dry run. The CLI must reject `--apply` if the input snapshot hash does not match the manifest.

- [ ] **Step 4: Add the package command and verify idempotency**

Run the planner twice against a restored test snapshot. The second plan must contain zero inserts and no lifecycle reversal.

- [ ] **Step 5: Run focused verification and commit**

```bash
npm test -- --run tests/embodied-data-migration.test.ts
npm run typecheck
git add data/migrations/embodied-data-public-switch-baseline.json src/pipeline/embodied-data-migration.ts src/cli/migrate-embodied-data.ts tests/embodied-data-migration.test.ts package.json
git commit -m "feat: add embodied migration baseline"
```

---

### Task 2: Replace the Current Source Catalog with Embodied Sources

**Files:**

- Create: `src/catalog/embodied-data/sources.ts`
- Create: `src/db/migrations/015_embodied_source_governance.ts`
- Create: `tests/embodied-data-source-schema.test.ts`
- Create: `tests/fixtures/embodied-data/launch/source-contract-cases.json`
- Modify: `src/catalog/sources.ts`
- Modify: `src/db/types.ts`
- Modify: `src/db/seed.ts`
- Modify: `src/pipeline/collect.ts`
- Modify: `tests/catalog.test.ts`
- Modify: `tests/collection-scope.test.ts`

**Interfaces:**

- Produces: `embodiedSourceCatalog`, `embodiedSourceSlugs`, and `legacySourcePolicy`.
- Produces: `isCurrentEmbodiedSource(source)` and an embodied-only default for `planSourceCollection`.

- [ ] **Step 1: Write failing catalog and collection-policy tests**

Assert that every current source has `content_scope = embodied-data`, a supported adapter, complete governance fields, and lifecycle `draft` or `shadow`. The schema must persist canonical owner, robots policy, freshness SLO, and adapter version; existing rate-limit, cadence, license, health, and lifecycle fields remain authoritative. Assert that restored generic-AI sources become disabled `retired`, never appear in an eligible collection plan, and retain their source runs and checks.

- [ ] **Step 2: Run the focused tests and observe RED**

```bash
npm test -- --run tests/embodied-data-source-schema.test.ts tests/catalog.test.ts tests/collection-scope.test.ts
```

- [ ] **Step 3: Add the missing source-governance columns**

Add `owner`, `robots_policy`, `freshness_slo_hours`, and `adapter_version` with backward-compatible defaults. Keep quota in `rate_limit_per_minute`, frequency in `cadence`, and health history in SourceCheck. Add the migration to the ordered migration registry and prove old snapshot restoration fills safe defaults.

- [ ] **Step 4: Implement the embodied source module**

Create explicit entries for the launch source families. Add the source categories `robot-team`, `data-service`, `capture-tool`, `dataset-benchmark`, `standard-policy`, and `peer-evidence`. For each entry set owner, tier, role, region, language, acquisition, license/robots note, cadence, authority, freshness target, adapter version, identity hosts, and `shadow` lifecycle. Reuse existing RSS, GitHub, arXiv, and manual adapters; add no source-specific branch to orchestration.

- [ ] **Step 5: Make seeding retire stale generic-AI sources without deleting provenance**

Update source seeding so catalog removal results in `enabled=0`, `observation_enabled=0`, `lifecycle_status=retired`, `maintenance_status=retired`, `content_scope=legacy-ai`, and `retired_at` set once. Never delete Source, Signal, SourceRun, or SourceCheck rows.

- [ ] **Step 6: Enforce embodied-only default collection selection**

`CollectionScope = "eligible"` must require current embodied scope plus lifecycle and health eligibility. Retain an explicit diagnostic scope that can inspect retired rows without collecting them.

- [ ] **Step 7: Verify contracts and commit**

```bash
npm test -- --run tests/embodied-data-source-schema.test.ts tests/catalog.test.ts tests/collection-scope.test.ts tests/collectors.test.ts
npm run typecheck
git add src/catalog/embodied-data/sources.ts src/catalog/sources.ts src/db/migrations/015_embodied_source_governance.ts src/db/types.ts src/db/seed.ts src/pipeline/collect.ts tests/embodied-data-source-schema.test.ts tests/catalog.test.ts tests/collection-scope.test.ts tests/fixtures/embodied-data/launch/source-contract-cases.json
git commit -m "feat: switch to embodied source catalog"
```

---

### Task 3: Add the Reviewed Launch Event Corpus

**Files:**

- Create: `src/catalog/embodied-data/events.ts`
- Create: `src/catalog/embodied-data/event-evidence.ts`
- Create: `tests/fixtures/embodied-data/launch/event-source-manifest.json`
- Create: `tests/embodied-data-launch-corpus.test.ts`
- Modify: `src/catalog/history.ts`

**Interfaces:**

- Produces: `EmbodiedLaunchEventSeed`, `embodiedLaunchEvents`, and `embodiedEventEvidence`.
- Every seed carries `contentScope: "embodied-data"`, a strict `EventDataProfile`, one or more pipeline-stage track slugs, and typed Evidence rows.

- [ ] **Step 1: Write the failing corpus contract test**

Assert:

- exactly 36 reviewed seed records and unique stable slugs;
- every date is within 2022-01-01 through the current evaluation time;
- all six pipeline stages have at least four Events;
- each Event has a DataProfile, at least one track, and a valid evidence threshold;
- every numeric scale, cost, throughput, quality, or adoption claim has its own source URL;
- no URL is unsafe and no title matches the negative golden set;
- the source manifest covers every evidence record and records `verifiedAt`.

- [ ] **Step 2: Run the corpus test and observe RED**

```bash
npm test -- --run tests/embodied-data-launch-corpus.test.ts
```

- [ ] **Step 3: Implement the 36 explicit catalog records**

Use the Launch Corpus Contract above. Do not import rows from `research-history-*`, use private preview scores, or synthesize sources. Use stable editorial copy that separates fact, interpretation, future watch, and recommended action.

- [ ] **Step 4: Add Evidence as first-class rows**

Use the existing Signal plus `event_signals` evidence path. Extend the seed input so each Event can persist multiple original-source Signals with evidence role, source identity, URL, and publication time. Do not add a parallel fact table.

- [ ] **Step 5: Verify the content and commit**

```bash
npm test -- --run tests/embodied-data-launch-corpus.test.ts tests/provenance.test.ts tests/readiness.test.ts
npm run typecheck
git add src/catalog/embodied-data/events.ts src/catalog/embodied-data/event-evidence.ts src/catalog/history.ts tests/embodied-data-launch-corpus.test.ts tests/fixtures/embodied-data/launch/event-source-manifest.json
git commit -m "feat: add embodied launch corpus"
```

---

### Task 4: Promote Reusable Data Objects and the Evidence-Backed Peer Matrix

**Files:**

- Create: `src/catalog/embodied-data/datasets.ts`
- Create: `src/catalog/embodied-data/standards.ts`
- Create: `src/catalog/embodied-data/collection-methods.ts`
- Create: `src/catalog/embodied-data/peers.ts`
- Create: `tests/embodied-data-launch-objects.test.ts`
- Modify: `src/db/seed.ts`
- Modify: `tests/embodied-data-objects-domain.test.ts`

**Interfaces:**

- Produces at least 12 Datasets, 4 Standards, 6 CollectionMethods, 15 peer targets, and evidence relations to launch Events.
- Produces: `embodiedDatasets`, `embodiedStandards`, `embodiedCollectionMethods`, and `embodiedPeers`.

- [ ] **Step 1: Replace the private-fixture boundary test with failing production-catalog assertions**

Keep test fixtures private. Assert production objects are separately authored, pass strict schemas, have stable slugs, and link to at least one launch Event. Require every capability to link through `actor_capability_evidence` with `claim`, `verification`, or `contradiction`.

- [ ] **Step 2: Run the focused tests and observe RED**

```bash
npm test -- --run tests/embodied-data-objects-domain.test.ts tests/embodied-data-launch-objects.test.ts
```

- [ ] **Step 3: Add production object catalogs**

Include at minimum DROID, Open X-Embodiment, BridgeData V2, RH20T, RoboSet, RoboMIND, AgiBot World, HoloAssist, Ego-Exo4D, LIBERO, RoboCasa, and BEHAVIOR-1K. Include RLDS, LeRobotDataset v3, ROS 2 rosbag2, and MCAP as standards/project formats. Include teleoperation, wearable human demonstration, autonomous rollout, simulation/synthetic generation, internet-video transfer, and hybrid collection as methods.

- [ ] **Step 4: Add the peer matrix data without inferred scores**

Seed the 15 targets listed above. Remove `table_score` from the embodied public decision path; retain the legacy database field only for compatibility. Store only sourced claims, verification status, limitations, source time, and evidence relations.

- [ ] **Step 5: Seed and verify idempotent relations**

Run seed twice. Object rows and relation counts must remain stable, and capability verification must never upgrade from self-claimed without independent evidence.

- [ ] **Step 6: Commit**

```bash
npm test -- --run tests/embodied-data-objects-domain.test.ts tests/embodied-data-objects-schema.test.ts tests/embodied-data-launch-objects.test.ts
npm run typecheck
git add src/catalog/embodied-data/datasets.ts src/catalog/embodied-data/standards.ts src/catalog/embodied-data/collection-methods.ts src/catalog/embodied-data/peers.ts src/db/seed.ts tests/embodied-data-objects-domain.test.ts tests/embodied-data-launch-objects.test.ts
git commit -m "feat: seed embodied data assets and peers"
```

---

### Task 5: Switch Tracks, Actors, Views, and Default Repository Queries

**Files:**

- Create: `src/catalog/embodied-data/tracks.ts`
- Modify: `src/db/seed.ts`
- Modify: `src/db/repository.ts`
- Modify: `tests/integration.test.ts`
- Create: `tests/embodied-data-public-boundary.test.ts`

**Interfaces:**

- Produces the six approved stage tracks with stable slugs from `EmbodiedPipelineStage`.
- Default reads return embodied current rows; explicit audit methods can read legacy rows.

- [ ] **Step 1: Write failing default-query isolation tests**

Insert paired embodied and legacy Sources, Signals, Events, Actors, Scout rows, Tracks, Resources, and Views. Assert `publicEvents`, `publicSignals`, `listTracks`, `listActors`, `listResources`, `publicScoutInsights`, and `getDefaultView` return only the embodied set. Assert explicit audit queries still return both sets.

- [ ] **Step 2: Run focused tests and observe RED**

```bash
npm test -- --run tests/embodied-data-public-boundary.test.ts
```

- [ ] **Step 3: Seed six pipeline tracks and the new default view**

Use the exact stage slugs and public names from the spec. Set old tracks and model-price resources to disabled instead of deleting them. The default view is `embodied-data-operations` and uses pipeline, key changes, evidence, assets, peers, sources, and actions blocks.

- [ ] **Step 4: Add scoped Repository defaults and explicit audit methods**

Prefer query-level scope predicates over export-only filtering. Add explicit method names such as `auditEvents({ scope: "all" })`; do not add an optional boolean that can silently expose legacy rows.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- --run tests/embodied-data-public-boundary.test.ts tests/integration.test.ts
npm run typecheck
git add src/catalog/embodied-data/tracks.ts src/db/seed.ts src/db/repository.ts tests/embodied-data-public-boundary.test.ts tests/integration.test.ts
git commit -m "feat: make embodied data the current domain"
```

---

### Task 6: Apply the Migration and Prove Snapshot Recovery

**Files:**

- Modify: `src/pipeline/embodied-data-migration.ts`
- Modify: `src/pipeline/snapshot.ts`
- Modify: `tests/snapshot.test.ts`
- Modify: `tests/embodied-data-migration.test.ts`
- Regenerate: `data/snapshot/v1.json`

**Interfaces:**

- Migration output records before/after counts, baseline hash, result hash, and public fingerprint.
- Snapshot restore must preserve all embodied objects and legacy provenance relations transactionally.

- [ ] **Step 1: Write failing migration round-trip and rollback-source tests**

Restore the baseline snapshot, apply the migration, snapshot it, restore it into an empty SQLite database, and compare counts, stable IDs, relations, lifecycle states, and embodied public fingerprints. Also prove the manifest base revision can restore the prior snapshot without destructive history rewriting.

- [ ] **Step 2: Run focused tests and observe RED**

```bash
npm test -- --run tests/embodied-data-migration.test.ts tests/snapshot.test.ts
```

- [ ] **Step 3: Implement the atomic migration and snapshot checks**

Write to a temporary snapshot path, parse and restore it into a fresh database, compare the expected fingerprint, then atomically replace `data/snapshot/v1.json`. On any failure, leave the versioned snapshot unchanged.

- [ ] **Step 4: Generate the current snapshot through the CLI**

```bash
npm run db:snapshot -- restore
npm run migrate:embodied -- --apply
npm run db:snapshot -- write
```

Do not edit the generated JSON.

- [ ] **Step 5: Run Phase 3 exit checks**

```bash
npm test -- --run tests/embodied-data-migration.test.ts tests/embodied-data-launch-corpus.test.ts tests/embodied-data-launch-objects.test.ts tests/embodied-data-public-boundary.test.ts tests/snapshot.test.ts tests/provenance.test.ts tests/collection-scope.test.ts
npm run typecheck
npm run public:fingerprint
git diff --check
```

Expected: 30–50 published embodied Events, six covered tracks, all launch objects related, legacy rows still auditable, and no generic-AI row in default reads.

- [ ] **Step 6: Commit Phase 3**

```bash
git add src/pipeline/embodied-data-migration.ts src/pipeline/snapshot.ts tests/snapshot.test.ts tests/embodied-data-migration.test.ts data/snapshot/v1.json
git commit -m "feat: migrate current data to embodied scope"
```
