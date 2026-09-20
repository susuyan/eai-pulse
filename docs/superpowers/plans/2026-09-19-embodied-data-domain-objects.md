# Embodied Data Domain Objects Implementation Plan

> **Execution:** Follow TDD per task. Commit each task separately. Do not change the public site, seed catalog, current snapshot, or production data in this package.

**Goal:** Add strict, evidence-aware Dataset, Standard, CollectionMethod, and PeerCompanyProfile domain objects with SQLite persistence, Repository contracts, backward-compatible snapshots, and source-verified private fixtures.

**Architecture:** Event remains the only fact node. Three reusable object types store versioned strict JSON profiles and connect to Event through typed relation tables. PeerCompanyProfile is derived from an existing Actor plus individual sourced capability claims; capability evidence links back to Event. All new snapshot fields are optional under schema version 1.

**Tech stack:** TypeScript, Zod, Kysely, SQLite, Vitest, Biome.

**Approved boundaries:**

- Branch: `codex/embodied-data-foundation`.
- No new runtime dependency.
- No seed or `data/snapshot/v1.json` change.
- No public DTO, route, navigation, readiness, ranking, or publishing change.
- Fixtures are test evidence, not production catalog entries.
- MySQL compatibility remains unclaimed.

---

## Contract Summary

### Shared sourced metric

```ts
interface SourcedMetricClaim {
  metric: string;
  value: number;
  unit: string;
  sourceUrl: string; // HTTPS only
}
```

### DatasetProfile

Required groups:

- identity: `name`, `version`, `publisher`, `releaseDate`, `canonicalUrl`;
- domain: pipeline stages, scenarios, embodiments, tasks, modalities, acquisition methods;
- production: sourced scale claims, data formats, sensor configuration, synchronization, calibration, annotations, quality methods;
- access: license, access mode and URL;
- use: use cases, sourced known results, limitations and evidence status.

### StandardProfile

Required groups:

- identity: name, `formal | de-facto | project-format`, organization, version, lifecycle and canonical URL;
- scope: pipeline stages and `schema | coordinate-system | time-sync | metadata | interface | storage | annotation` areas;
- adoption: implementations, compatible tools, adopters, migration requirements;
- evidence: verified date and evidence status.

### CollectionMethodProfile

Required groups:

- identity: name, acquisition method kind and canonical evidence URL;
- applicability: scenarios, embodiments, tasks, required equipment, operator roles, environment requirements and modalities;
- operations: quality boundaries, sourced throughput/cost claims, deployment complexity and safety risks;
- decision: advantages, limitations, failure modes, maturity and evidence status.

### ActorDataCapability

```ts
interface ActorDataCapability {
  capabilityKey: string;
  pipelineStages: EmbodiedPipelineStage[];
  claimText: string;
  claimant: "company" | "independent";
  sourceUrl: string;
  claimedAt: string;
  verificationStatus:
    | "self-claimed"
    | "independently-verified"
    | "conflicting"
    | "unknown";
  verifiedAt: string | null;
  confidence: number;
  limitations: string[];
}
```

Actor existence means only “collected.” Capability rows preserve claims. Only `independently-verified` means the claim has independent support. PeerCompanyProfile is a derived Actor plus its validated capability rows.

---

### Task 1: Complete the Docs-First Package

**Files:**

- Modify: `docs/specs/2026-09-19-embodied-data-intelligence/DEVELOPMENT-GUIDE.md`
- Create: `docs/specs/2026-09-19-embodied-data-intelligence/DOMAIN-OBJECTS-PRD.md`
- Create: `docs/specs/2026-09-19-embodied-data-intelligence/DOMAIN-OBJECTS-SYSTEM.md`
- Create: `docs/specs/2026-09-19-embodied-data-intelligence/DOMAIN-OBJECTS-TEST.md`
- Create: `docs/specs/2026-09-19-embodied-data-intelligence/DOMAIN-OBJECTS-TASKS.md`
- Create: `docs/superpowers/plans/2026-09-19-embodied-data-domain-objects.md`

Steps:

1. Confirm Event remains the only fact node.
2. Confirm fixtures do not enter seed or current snapshot.
3. Confirm four object schemas, eight tables, Repository and snapshot boundaries.
4. Review this plan before implementation.
5. Commit:

```bash
git add docs/specs/2026-09-19-embodied-data-intelligence docs/superpowers/plans/2026-09-19-embodied-data-domain-objects.md
git commit -m "docs: plan embodied data domain objects"
```

---

### Task 2: Add Source-Verified Private Fixtures

**Files:**

- Create: `tests/fixtures/embodied-data/objects/datasets.json`
- Create: `tests/fixtures/embodied-data/objects/standards.json`
- Create: `tests/fixtures/embodied-data/objects/collection-methods.json`
- Create: `tests/fixtures/embodied-data/objects/actor-capabilities.json`
- Create: `tests/fixtures/embodied-data/objects/source-manifest.json`

Use only primary sources verified on 2026-09-19:

- DROID project and paper: `https://droid-dataset.github.io/`, `https://arxiv.org/abs/2403.12945`
- Open X-Embodiment project and paper: `https://robotics-transformer-x.github.io/`, `https://arxiv.org/abs/2310.08864`
- BridgeData V2 project and paper: `https://rail-berkeley.github.io/bridgedata/`, `https://arxiv.org/abs/2308.12952`
- RLDS official repository: `https://github.com/google-research/rlds`
- LeRobotDataset v3 official docs: `https://huggingface.co/docs/lerobot/lerobot-dataset-v3`
- rosbag2 official repository: `https://github.com/ros2/rosbag2`
- NVIDIA Isaac Sim official synthetic-data page: `https://developer.nvidia.com/isaac/sim/`

Rules:

1. Record only source-supported fields.
2. Use `null` or an empty array for unknowns.
3. Every numeric claim has its own source URL.
4. Keep actor capability cases synthetic and clearly named `Fixture Company`; they test state boundaries, not real peer claims.
5. The source manifest records object slug, source role, URL and `verifiedAt`.

Do not commit yet; schemas in Task 3 validate these fixtures in the same focused commit.

---

### Task 3: Implement Strict Domain Schemas

**Files:**

- Create: `src/domain/embodied-data-objects.ts`
- Create: `tests/embodied-data-objects-domain.test.ts`
- Use fixtures from Task 2.

Steps:

1. Write table-driven fixture tests for three datasets, three standards and three collection methods.
2. Add failure cases for HTTP URL, unknown standard type, extra field, empty pipeline stages and a metric without `sourceUrl`.
3. Add actor capability cases for `self-claimed`, `independently-verified`, `conflicting` and `unknown`.
4. Run the test and observe import failure.
5. Implement strict schemas using existing controlled vocabularies from `embodied-data.ts`.
6. Do not duplicate existing enums.
7. Run:

```bash
npm test -- --run tests/embodied-data-objects-domain.test.ts
npm run typecheck
```

8. Commit:

```bash
git add src/domain/embodied-data-objects.ts tests/embodied-data-objects-domain.test.ts tests/fixtures/embodied-data/objects
git commit -m "feat: define embodied data domain objects"
```

---

### Task 4: Add the Domain Object Migration and Types

**Files:**

- Create: `src/db/migrations/013_embodied_data_objects.ts`
- Modify: `src/db/migrations/index.ts`
- Modify: `src/db/types.ts`
- Create: `tests/embodied-data-objects-schema.test.ts`

Tables:

```text
datasets(id, slug, profile_json, schema_version, created_at, updated_at)
dataset_events(dataset_id, event_id, relation_role, created_at)
standards(id, slug, profile_json, schema_version, created_at, updated_at)
standard_events(standard_id, event_id, relation_role, created_at)
collection_methods(id, slug, profile_json, schema_version, created_at, updated_at)
collection_method_events(collection_method_id, event_id, relation_role, created_at)
actor_data_capabilities(id, actor_id, capability_key, profile_json, schema_version, created_at, updated_at)
actor_capability_evidence(capability_id, event_id, evidence_role, created_at)
```

Constraints:

- object slugs unique;
- `actor_id + capability_key` unique;
- relation tables use composite primary keys including relation role where multiple roles are valid;
- all foreign keys cascade when the owned parent is deleted;
- Event deletion deletes only relation/evidence rows;
- defaults only for `schema_version = 1`.

Steps:

1. Write a failing table/constraint test.
2. Implement `up` and exact reverse-order `down`.
3. Register migration 013 and Kysely table types.
4. Test Event deletion, object deletion and Actor deletion semantics.
5. Run:

```bash
npm test -- --run tests/embodied-data-objects-schema.test.ts
npm run typecheck
```

6. Commit:

```bash
git add src/db/migrations/013_embodied_data_objects.ts src/db/migrations/index.ts src/db/types.ts tests/embodied-data-objects-schema.test.ts
git commit -m "feat: add embodied data object persistence"
```

---

### Task 5: Add Repository and Peer Profile Contracts

**Files:**

- Modify: `src/db/repository.ts`
- Modify: `tests/embodied-data-objects-schema.test.ts`

Steps:

1. Write failing tests for each upsert/get/list method and each Event link method.
2. Assert invalid JSON is rejected before write and the previous valid profile remains unchanged.
3. Assert repeated links are idempotent.
4. Assert `getPeerCompanyProfile(actorId)` returns Actor identity separately from capability claims.
5. Assert Actor with no capability rows is still a collected Actor and returns an empty capability list.
6. Implement explicit methods. Avoid a generic untyped repository abstraction.
7. Parse every write and every read with its matching Zod Schema.
8. Run:

```bash
npm test -- --run tests/embodied-data-objects-schema.test.ts
npm run typecheck
```

9. Commit:

```bash
git add src/db/repository.ts tests/embodied-data-objects-schema.test.ts
git commit -m "feat: persist embodied data domain objects"
```

---

### Task 6: Extend Snapshot Round-Trip Additively

**Files:**

- Modify: `src/pipeline/snapshot.ts`
- Modify: `tests/snapshot.test.ts`

Steps:

1. Extend snapshot tests with one object of each type, all relation types, one capability claim and one capability evidence link.
2. Assert deterministic write and fresh-database restore equality.
3. Strip all eight optional fields and restore as an old v1 snapshot; assert new tables remain empty.
4. Keep `SNAPSHOT_SCHEMA_VERSION = 1`.
5. Serialize relations by `eventSlug`, object slug, `actorSlug`, `capabilityKey` and role.
6. Validate every profile during write and restore.
7. Restore in dependency order inside the existing transaction.
8. Add all new arrays to snapshot counts.
9. Run:

```bash
npm test -- --run tests/snapshot.test.ts tests/embodied-data-objects-schema.test.ts
npm run typecheck
```

10. Commit:

```bash
git add src/pipeline/snapshot.ts tests/snapshot.test.ts
git commit -m "feat: snapshot embodied data domain objects"
```

---

### Task 7: Close Fixture, Cascade, and Privacy Boundaries

**Files:**

- Modify: `tests/embodied-data-objects-domain.test.ts`
- Modify: `tests/embodied-data-objects-schema.test.ts`
- Modify: `tests/snapshot.test.ts`

Steps:

1. Verify exactly three real fixtures for each object type.
2. Verify source-manifest coverage for every real fixture and HTTPS-only URLs.
3. Verify no fixture is present in `src/db/seed.ts` or `data/snapshot/v1.json`.
4. Verify all cascade and idempotency behaviors.
5. Verify serialized snapshots contain no raw payload, local path, token or private note.
6. Run targeted tests:

```bash
npm test -- --run tests/embodied-data-domain.test.ts tests/embodied-data-objects-domain.test.ts tests/embodied-data-objects-schema.test.ts tests/snapshot.test.ts
```

7. Commit only if test changes remain:

```bash
git add tests/embodied-data-objects-domain.test.ts tests/embodied-data-objects-schema.test.ts tests/snapshot.test.ts
git commit -m "test: verify embodied data object boundaries"
```

If no test changes remain, record Task 7 evidence under the Task 6 commit instead of creating an empty commit.

---

### Task 8: Record the Experimental Package and Verify

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `src/catalog/product.ts`
- Modify: `docs/specs/2026-09-19-embodied-data-intelligence/DOMAIN-OBJECTS-TASKS.md`

Add the same fact to both Changelog sources:

```text
具身数据实验性领域基础新增 Dataset、Standard、CollectionMethod 与同行能力声明对象，支持严格校验、Event 证据关联和快照恢复；对象 fixture 尚未进入当前数据或公开站。
```

Keep `productVersion` unchanged. Extend the existing `embodied-data-foundation` capability evidence; do not add a duplicate capability.

Run:

```bash
npm test -- --run tests/embodied-data-domain.test.ts tests/embodied-data-objects-domain.test.ts tests/embodied-data-objects-schema.test.ts tests/snapshot.test.ts
npm run check
npm run build
git diff 5867ad9..HEAD -- data/snapshot/v1.json src/db/seed.ts src/pipeline/export.ts web/public
git status --short
```

Expected:

- all commands pass;
- the final diff command is empty;
- only intended tracked documentation/catalog files remain before the final commit;
- no fixture is described as production content.

Update TASKS with exact evidence and commits, then commit:

```bash
git add CHANGELOG.md src/catalog/product.ts docs/specs/2026-09-19-embodied-data-intelligence/DOMAIN-OBJECTS-TASKS.md
git commit -m "docs: record embodied data domain objects"
```

---

## Final Review

```bash
git status --short
git diff 5867ad9..HEAD --stat
git log --oneline 5867ad9..HEAD
```

Stop after the package is verified. Do not merge, push, modify current data, or begin source catalog replacement without a separate reviewed plan.
