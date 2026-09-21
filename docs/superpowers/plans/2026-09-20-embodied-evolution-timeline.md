# Embodied Evolution Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Event list with an evidence-bound embodied-data evolution timeline and restore daily, deterministic thematic trend discovery on the homepage.

**Architecture:** Add domain-specific `EvolutionPhase` and `EmbodiedTrend` catalogs that store interpretation plus Event references, then resolve them against published embodied Events during export. Render a server-first `/timeline/` and homepage summary; use small JavaScript modules only for filtering and deterministic Asia/Shanghai daily ordering.

**Tech Stack:** TypeScript 5.9, Zod 4, Vitest, server-rendered static HTML, vanilla ES2022 modules, CSS.

**Spec:** `docs/superpowers/specs/2026-09-20-embodied-data-evolution-timeline-design.md`

## Global Constraints

- Plan dependency: execute `docs/superpowers/plans/2026-09-20-embodied-source-map-and-event-backfill.md` first.
- `Event` remains the only fact node; phases and trends contain no independent evidence URLs.
- Timeline organization is `time phase × six-stage pipeline`, with manually curated phase boundaries.
- Phase `start` and `end` are inclusive Asia/Shanghai calendar dates; each next phase starts exactly one calendar day after the previous phase ends.
- Missing stage evidence renders as `no-public-evidence`; it must not be filled with an inferred claim.
- `/lines/` and generic AI six-domain navigation must not return.
- All phase/trend content must be readable without JavaScript.
- Daily trend ordering uses the Asia/Shanghai calendar date and is stable for all users on the same day.
- Update both changelog sources and pass `npm run check` plus `npm run build`.

## Review Focus

- A phase boundary that overlaps another phase or leaves an internal date gap must fail validation; Task 1 tests both.
- A phase may reference an Event outside its own date range only as explicit counter-evidence; Task 2 tests this distinction.
- A trend with duplicate Events, only one Event, or a legacy Event must fail export; Task 2 tests all three.
- Users west/east of Shanghai must receive the same daily order; Task 5 tests dates around UTC day boundaries.
- Filtering one pipeline stage must not hide the complete Event index or mutate the URL into a legacy route; Task 4 tests progressive enhancement and fallback.

---

## File Structure

- Create `src/domain/embodied-narrative.ts`: strict Zod schemas.
- Create `src/catalog/embodied-data/evolution.ts`: curated phases and thematic trends.
- Create `src/pipeline/static-site/embodied-narrative.ts`: reference resolution and public projection.
- Modify `src/pipeline/static-site/dto.ts`: public phase/trend DTOs and model fields.
- Modify `src/pipeline/export.ts`: build and export `data/evolution.json`.
- Create `src/pipeline/static-site/pages/timeline.ts`: evolution page renderer.
- Modify `src/pipeline/static-site/pages/pipeline.ts` and `src/pipeline/static-site/pages.ts`: keep pipeline rendering separate and route the timeline renderer.
- Modify `src/pipeline/static-site/pages/home.ts`: evolution summary and trend cards.
- Create `web/public/assets/embodied-trends.js`: deterministic daily ordering.
- Modify `web/public/assets/timeline.js`, `web/public/assets/core.js`, and `web/public/assets/app.css`: phase filtering and presentation.
- Modify fixtures and static/public integrity tests.

### Task 1: Define strict narrative schemas

**Files:**
- Create: `src/domain/embodied-narrative.ts`
- Test: `tests/embodied-narrative-domain.test.ts`

**Interfaces:**
- Produces: `EvolutionPhaseSchema`, `EmbodiedTrendSchema`, `EvolutionPhase`, `EmbodiedTrend`, `PhaseStageImpact`.
- Consumes: `EmbodiedPipelineStageSchema`.

- [ ] **Step 1: Write failing schema tests**

```ts
const validImpact = {
  summary: "Public evidence shows how this phase changes one production decision.",
  eventSlugs: ["embodied-event"],
  evidenceState: "supported" as const,
};
const validPhase = {
  slug: "scaled-robot-data-production",
  start: "2025-04-15",
  end: "2026-09-20",
  title: "Robot data production becomes an operating system",
  thesis: "Collection, quality, and training feedback converge into one production loop.",
  turningPoint: "Teams expose production infrastructure rather than isolated datasets.",
  eventSlugs: ["embodied-event"],
  stageImpacts: Object.fromEntries(
    EmbodiedPipelineStageSchema.options.map((stage) => [stage, validImpact]),
  ),
  counterEventSlugs: [],
  nextSignals: ["Watch for independently verified throughput and training gain."],
};
expect(EvolutionPhaseSchema.parse(validPhase).slug).toBe(validPhase.slug);
expect(EmbodiedTrendSchema.safeParse({ ...trend, eventSlugs: ["one"] }).success).toBe(false);
expect(
  EvolutionPhaseSchema.safeParse({
    ...validPhase,
    stageImpacts: { "demand-definition": validImpact },
  }).success,
).toBe(false);
```

Schema-level validation covers ISO dates, six exact stage keys, unique Event slugs, non-empty editorial fields, and `supported | limited | no-public-evidence`.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/embodied-narrative-domain.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the schemas and types**

```ts
export const PhaseStageImpactSchema = z.object({
  summary: z.string().trim().min(20).max(800),
  eventSlugs: z.array(z.string().trim().min(2)).max(24),
  evidenceState: z.enum(["supported", "limited", "no-public-evidence"]),
}).strict();
```

Use an explicit six-key `z.object()` for `stageImpacts`, not a permissive record, so missing and unknown stages fail.

- [ ] **Step 4: Run domain tests**

Run: `npx vitest run tests/embodied-narrative-domain.test.ts tests/embodied-data-domain.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the domain contract**

```bash
git add src/domain/embodied-narrative.ts tests/embodied-narrative-domain.test.ts
git commit -m "feat: define embodied narrative schemas"
```

### Task 2: Curate and resolve phases and trends

**Files:**
- Create: `src/catalog/embodied-data/evolution.ts`
- Create: `src/pipeline/static-site/embodied-narrative.ts`
- Modify: `src/pipeline/static-site/dto.ts:1-70,379-401`
- Test: `tests/embodied-narrative-catalog.test.ts`
- Test: `tests/embodied-data-public-dto.test.ts`

**Interfaces:**
- Produces: `buildPublicEmbodiedNarrative(events, phases, trends): PublicEmbodiedNarrative`.
- Public output: `PublicEvolutionPhase[]`, `PublicEmbodiedTrend[]`, each containing resolved `PublicEventRelation` links and no raw/private fields.

- [ ] **Step 1: Write failing resolver tests**

```ts
expect(() => buildPublicEmbodiedNarrative(events, overlappingPhases, trends)).toThrow(
  "overlap",
);
expect(() => buildPublicEmbodiedNarrative(events, phasesWithUnknownEvent, trends)).toThrow(
  "unknown event",
);
expect(() => buildPublicEmbodiedNarrative(events, phases, [{ ...trend, eventSlugs: ["legacy"] }]))
  .toThrow("embodied-data");
expect(projected.phases.length).toBeGreaterThanOrEqual(5);
expect(projected.phases.length).toBeLessThanOrEqual(7);
expect(projected.trends.length).toBeGreaterThanOrEqual(8);
```

Also assert that a main Event outside the phase range fails, while a counter-event may fall outside the range and remains explicitly labeled counter-evidence.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/embodied-narrative-catalog.test.ts tests/embodied-data-public-dto.test.ts`

Expected: FAIL because catalog and resolver do not exist.

- [ ] **Step 3: Implement reference resolution and cross-record validation**

Build a slug map from published `PublicEmbodiedEvent[]`; reject missing/legacy slugs, non-contiguous phase ranges, overlaps, internal gaps, out-of-range main Events, and trends with fewer than two unique Events.

- [ ] **Step 4: Curate 5–7 phases from the approved evidence ledger**

Each phase must have all six `stageImpacts`. Use the ledger from Plan 1 to define evidence-based boundaries; retain `no-public-evidence` where a stage has no supporting Event. Curate at least eight cross-Event trends across teleoperation/human demonstrations, multimodal/tactile capture, simulation/synthetic data, cross-embodiment reuse, production operations, data formats/standards, quality/training feedback, and robot data factories.

- [ ] **Step 5: Run resolver and DTO tests**

Run: `npx vitest run tests/embodied-narrative-domain.test.ts tests/embodied-narrative-catalog.test.ts tests/embodied-data-public-dto.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the curated narrative**

```bash
git add src/catalog/embodied-data/evolution.ts src/pipeline/static-site/embodied-narrative.ts src/pipeline/static-site/dto.ts tests/embodied-narrative-catalog.test.ts tests/embodied-data-public-dto.test.ts
git commit -m "feat: curate embodied data evolution"
```

### Task 3: Export the allowlisted evolution DTO

**Files:**
- Modify: `src/pipeline/export.ts:90-335,550-590`
- Modify: `src/pipeline/public-site-integrity.ts`
- Modify: `tests/fixtures/embodied-site-model.ts`
- Test: `tests/public-site-integrity.test.ts`
- Test: `tests/integration.test.ts`

**Interfaces:**
- Consumes: `buildPublicEmbodiedNarrative()` from Task 2.
- Produces: `StaticSiteModel.evolutionPhases`, `StaticSiteModel.embodiedTrends`, and `dist/data/evolution.json` with `schemaVersion: 1`.

- [ ] **Step 1: Add failing export and privacy tests**

```ts
const evolution = JSON.parse(await readFile(join(config.distDir, "data/evolution.json"), "utf8"));
expect(evolution.schemaVersion).toBe(1);
expect(evolution.phases.length).toBeGreaterThanOrEqual(5);
expect(evolution.trends.length).toBeGreaterThanOrEqual(8);
expect(JSON.stringify(evolution)).not.toMatch(/raw_|private-|\/Users\//);
```

Add `data/evolution.json` to required public files and assert every referenced Event has a generated detail page.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/public-site-integrity.test.ts tests/integration.test.ts`

Expected: FAIL because the output and model fields do not exist.

- [ ] **Step 3: Wire the resolver into export and write the DTO**

Resolve after `buildEmbodiedPublicData()` so the projector receives the same published Event objects used by the site. Write only schema version, generated time, phases, and trends.

- [ ] **Step 4: Update integrity counts and reference checks**

Count phases and trends; reject absent output, unknown Event detail links, legacy strings, or private fields.

- [ ] **Step 5: Run export tests**

Run: `npx vitest run tests/public-site-integrity.test.ts tests/integration.test.ts tests/static-site-privacy.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the export contract**

```bash
git add src/pipeline/export.ts src/pipeline/public-site-integrity.ts tests/fixtures/embodied-site-model.ts tests/public-site-integrity.test.ts tests/integration.test.ts
git commit -m "feat: export embodied evolution data"
```

### Task 4: Replace the flat timeline with the phase-by-pipeline view

**Files:**
- Create: `src/pipeline/static-site/pages/timeline.ts`
- Modify: `src/pipeline/static-site/pages/pipeline.ts:1-70`
- Modify: `src/pipeline/static-site/pages.ts:1-120`
- Modify: `web/public/assets/core.js:12-30`
- Modify: `web/public/assets/timeline.js:265-300`
- Modify: `web/public/assets/app.css:5491-5600`
- Test: `tests/static-site-intelligence.test.ts`
- Test: `tests/static-site-accessibility.test.ts`
- Test: `tests/static-site-seo.test.ts`

**Interfaces:**
- Produces: `renderEmbodiedEvolutionTimeline(model, locale): string` and `setupEmbodiedEvolutionTimeline(root)`.
- Consumes: resolved phase/event DTOs from Task 3.

- [ ] **Step 1: Write failing server-rendering tests**

Assert the page contains phase navigation in chronological order, all six stage impact cells per phase, `no-public-evidence` copy, linked key/counter Events, and the complete reverse-chronological Event index. Assert no `/lines/` or generic AI trend labels.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/static-site-intelligence.test.ts tests/static-site-accessibility.test.ts tests/static-site-seo.test.ts`

Expected: FAIL because `/timeline/` still renders a flat list.

- [ ] **Step 3: Implement the server-first timeline renderer**

Render: current-phase summary, chronological phase navigation, phase sections, six-stage impact grid, counter-evidence/next signals, and the full Event index. External text remains escaped; Event links use internal routes.

- [ ] **Step 4: Implement progressive stage filtering**

Use `data-evolution-stage-filter` buttons. Filtering hides non-selected impact cells but never removes phase headings or the complete Event index. Arrow keys move between filter buttons, Escape restores `all`, and reduced-motion users receive no smooth scrolling.

- [ ] **Step 5: Add responsive and no-script CSS**

Desktop uses a six-column comparison grid where space permits; tablet/mobile uses a stacked stage list with no page-level horizontal overflow. `[hidden]` must win over component display rules.

- [ ] **Step 6: Run focused page tests**

Run: `npx vitest run tests/static-site-intelligence.test.ts tests/static-site-accessibility.test.ts tests/static-site-seo.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the evolution timeline**

```bash
git add src/pipeline/static-site/pages/timeline.ts src/pipeline/static-site/pages/pipeline.ts src/pipeline/static-site/pages.ts web/public/assets/core.js web/public/assets/timeline.js web/public/assets/app.css tests/static-site-intelligence.test.ts tests/static-site-accessibility.test.ts tests/static-site-seo.test.ts
git commit -m "feat: render embodied evolution timeline"
```

### Task 5: Add homepage evolution summary and daily stable trends

**Files:**
- Modify: `src/pipeline/static-site/pages/home.ts`
- Create: `web/public/assets/embodied-trends.js`
- Modify: `web/public/assets/core.js:1-35,110-145`
- Modify: `src/pipeline/export.ts:550-590`
- Modify: `web/public/assets/app.css`
- Test: `tests/embodied-trend-rotation.test.ts`
- Test: `tests/static-site-intelligence.test.ts`
- Test: `tests/integration.test.ts`

**Interfaces:**
- Produces: `shanghaiDateKey(date)`, `dailyTrendOrder(length, dateKey)`, and `setupDailyEmbodiedTrends(root)`.
- Consumes: `model.evolutionPhases` and `model.embodiedTrends`.

- [ ] **Step 1: Write failing deterministic-order tests**

```ts
expect(shanghaiDateKey(new Date("2026-09-19T15:59:59Z"))).toBe("2026-09-19");
expect(shanghaiDateKey(new Date("2026-09-19T16:00:00Z"))).toBe("2026-09-20");
expect(dailyTrendOrder(8, "2026-09-20")).toEqual(dailyTrendOrder(8, "2026-09-20"));
expect(dailyTrendOrder(8, "2026-09-20")).not.toEqual(dailyTrendOrder(8, "2026-09-21"));
expect(dailyTrendOrder(0, "2026-09-20")).toEqual([]);
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/embodied-trend-rotation.test.ts tests/static-site-intelligence.test.ts`

Expected: FAIL because the module and homepage sections do not exist.

- [ ] **Step 3: Implement pure date and order functions**

Compute the date key with `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", ... })`. Use a stable 32-bit string hash and seeded Fisher–Yates shuffle; do not call `Math.random()`.

- [ ] **Step 4: Render all trend cards and the evolution summary**

Server-render all cards inside `[data-embodied-trends]`; the first curated card is visible without JavaScript. Each card shows thesis, why now, stage chips, linked Events, counter-evidence/unknowns, and next watch. The summary links to `/timeline/` and identifies current plus previous phase.

- [ ] **Step 5: Load and optimize the module only when needed**

Replace old random-trend logic in `core.js` with a guarded dynamic import. Update `optimizeStaticAssets()` to minify `embodied-trends.js` together with `core.js` and `timeline.js`.

- [ ] **Step 6: Run deterministic, integration, and accessibility tests**

Run: `npx vitest run tests/embodied-trend-rotation.test.ts tests/static-site-intelligence.test.ts tests/integration.test.ts tests/static-site-accessibility.test.ts`

Expected: PASS; source tests confirm no `Math.random()` in the embodied trend module.

- [ ] **Step 7: Commit homepage discovery**

```bash
git add src/pipeline/static-site/pages/home.ts web/public/assets/embodied-trends.js web/public/assets/core.js web/public/assets/app.css src/pipeline/export.ts tests/embodied-trend-rotation.test.ts tests/static-site-intelligence.test.ts tests/integration.test.ts tests/static-site-accessibility.test.ts
git commit -m "feat: add daily embodied data trends"
```

### Task 6: Update release evidence and complete visual verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `src/catalog/product.ts`
- Modify: `tests/public-site-integrity.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: final release evidence and verified rendered artifacts.

- [ ] **Step 1: Update both changelog sources**

Describe the evidence-bound development timeline, six-stage phase matrix, homepage summary, and daily stable embodied-data trends under `Unreleased`.

- [ ] **Step 2: Run the full gate**

Run: `npm run check`

Expected: lint, typecheck, all tests, export, and public integrity validation pass.

- [ ] **Step 3: Build the project**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Inspect desktop and mobile renders**

Open `dist/timeline/index.html` and `dist/index.html` at 1280px and 390px. Confirm chronological phases, six-stage filtering, complete Event index, same-day trend stability, keyboard focus visibility, reduced-motion behavior, and zero horizontal overflow.

- [ ] **Step 5: Inspect public data and negative boundaries**

Inspect `dist/data/evolution.json`, sitemap, `llms.txt`, Chinese and English pages. Confirm all Event links resolve, no private fields exist, and `/lines/`, “六个领域趋势”, model-pricing, and generic AI narrative names are absent.

- [ ] **Step 6: Commit the release evidence**

```bash
git add CHANGELOG.md src/catalog/product.ts tests/public-site-integrity.test.ts
git commit -m "chore: document embodied evolution timeline"
```
