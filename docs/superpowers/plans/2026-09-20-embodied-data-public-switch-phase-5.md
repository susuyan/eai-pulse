# Embodied Data Public Switch Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the exported static product, machine-readable outputs, release record, and GitHub Pages deployment from generic AI to the approved embodied-data production experience.

**Architecture:** Build one allowlisted `StaticSiteModel` from embodied-only repository reads. Render the approved pipeline-first information architecture through small page modules while retaining the existing static render shell and asset pipeline. Treat generated HTML, JSON, RSS, sitemap, and `llms.txt` as one atomic export and validate them against the same public fingerprint before publishing.

**Tech Stack:** TypeScript, server-rendered static HTML, CSS, Zod, Vitest, GitHub Actions, GitHub Pages, npm.

**Spec:** `docs/superpowers/specs/2026-09-20-embodied-data-public-switch-design.md`

## Global Constraints

- Brand: `Agent Pulse`; subtitle: `具身数据情报与生产洞察`.
- Primary navigation: `关键变化 / 数据管线 / 数据资产 / 行业同行 / 来源地图 / 行动建议`.
- Timeline is a secondary route. Do not generate model-price, generic-AI domain, generic signal, or old track pages.
- Public output is static and allowlisted. Never export raw payload, database fields, tokens, local paths, private notes, or management state.
- Keep the current lightweight visual shell and interaction model. Introduce the six-stage pipeline rail as the main visual identity; do not redesign unrelated chrome.
- Public content is Chinese-first with a complete English counterpart for navigation, metadata, and essential explanations.
- Update both `CHANGELOG.md` and `src/catalog/product.ts` in the same commit.
- Do not claim completion until local checks, CI, Pages, four manual workflows, and live browser validation all pass.

## Review Focus

- Every visible fact and capability claim has a clickable original source.
- Claimed, independently verified, conflicting, and unknown states are visually distinct.
- Old URLs produce the new 404/find path and do not expose legacy content.
- Sitemap, RSS, JSON-LD, `llms.txt`, and public JSON contain only embodied current records.
- Keyboard focus, semantic landmarks, reduced motion, narrow viewports, and long Chinese titles remain usable.
- Generated artifact counts match the repository model and the versioned public fingerprint.

---

## Route Contract

| Route | Purpose |
| --- | --- |
| `/` | Pipeline-first home and current key changes |
| `/pipeline/` | Six stages, milestones, comparisons, counter-evidence, and next signals |
| `/assets/` | Dataset, Standard, and CollectionMethod browser |
| `/peers/` | Evidence-backed peer capability matrix |
| `/sources/` | Source coverage, lifecycle, health, and gaps |
| `/scout/` | Embodied-data production opportunities |
| `/timeline/` | Secondary chronological view |
| `/events/{slug}/` | Event, DataProfile, relations, boundaries, and Evidence |
| `/changelog/` | Product changes and current boundaries |
| `/legal/` | Legal and source-use boundary |
| `/404.html` | Removed-route explanation and links to current views |

Generate the same route set under `/en/`. Do not generate `/lines/`, `/signals/`, `/actors/`, `/resources/`, `/product/`, or `/industry-evolution/`.

---

### Task 1: Define the Embodied Public DTO and Static-Site Model

**Files:**

- Modify: `src/pipeline/static-site/dto.ts`
- Create: `src/pipeline/static-site/embodied-intelligence.ts`
- Modify: `src/pipeline/export.ts`
- Create: `tests/embodied-data-public-dto.test.ts`
- Create: `tests/static-site-privacy.test.ts`
- Modify: `tests/integration.test.ts`

**Interfaces:**

- Produces allowlisted `PublicEventDataProfile`, `PublicDataset`, `PublicStandard`, `PublicCollectionMethod`, `PublicPeer`, and `PublicPeerCapability`.
- Extends `StaticSiteModel` with pipeline stages, data assets, peer matrix, and typed evidence summaries.

- [ ] **Step 1: Write failing DTO allowlist and legacy-leak tests**

Seed one complete embodied graph plus legacy and private sentinel fields. Assert the public model contains the complete embodied relations and none of the sentinels, raw JSON fields, internal IDs where not needed, local paths, admin fields, legacy rows, or retired sources.

- [ ] **Step 2: Run focused tests and observe RED**

```bash
npm test -- --run tests/embodied-data-public-dto.test.ts tests/integration.test.ts
```

- [ ] **Step 3: Implement typed public projection**

Build public DTOs from Repository records through named projection functions. Parse strict domain profiles before mapping. Sort stages by the approved pipeline order and evidence by publication time/source role.

- [ ] **Step 4: Export the new public JSON set**

Write `data/events.json`, `data/pipeline.json`, `data/assets.json`, `data/peers.json`, `data/sources.json`, `data/scout.json`, and `data/product.json`. Stop writing generic timeline, track, signal, and model-resource payloads.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- --run tests/embodied-data-public-dto.test.ts tests/integration.test.ts tests/static-site-privacy.test.ts
npm run typecheck
git add src/pipeline/static-site/dto.ts src/pipeline/static-site/embodied-intelligence.ts src/pipeline/export.ts tests/embodied-data-public-dto.test.ts tests/static-site-privacy.test.ts tests/integration.test.ts
git commit -m "feat: export embodied public data"
```

---

### Task 2: Render the Pipeline-First Home and Primary Pages

**Files:**

- Create: `src/pipeline/static-site/pages/home.ts`
- Create: `src/pipeline/static-site/pages/pipeline.ts`
- Create: `src/pipeline/static-site/pages/assets.ts`
- Create: `src/pipeline/static-site/pages/peers.ts`
- Create: `src/pipeline/static-site/pages/sources.ts`
- Create: `src/pipeline/static-site/pages/scout.ts`
- Create: `src/pipeline/static-site/pages/event.ts`
- Create: `src/pipeline/static-site/pages/shared.ts`
- Modify: `src/pipeline/static-site/pages.ts`
- Modify: `src/pipeline/static-site/render.ts`
- Modify: `src/pipeline/static-site/i18n.ts`
- Modify: `tests/static-site-intelligence.test.ts`
- Modify: `tests/integration.test.ts`

**Interfaces:**

- `renderStaticPages(model)` emits exactly the Route Contract for `zh` and `en`.
- Page modules accept the allowlisted model only; they do not query the database.

- [ ] **Step 1: Write failing route, navigation, and content tests**

Assert the exact primary navigation labels and hrefs, six ordered pipeline stages, four decision views, evidence links, status labels, 404 copy, and absence of generic six-domain, model-price, and old-route content.

- [ ] **Step 2: Run focused tests and observe RED**

```bash
npm test -- --run tests/static-site-intelligence.test.ts tests/integration.test.ts
```

- [ ] **Step 3: Extract shared page primitives without changing behavior**

Move shell, section header, evidence link, empty state, status chip, and locale helpers out of the current monolith. Keep escaping and safe-URL behavior intact.

- [ ] **Step 4: Implement the pipeline-first home**

Render, in order: key production changes, six-stage pipeline rail, primary evidence chain, and the four decision views for assets, peers, sources, and actions. The first viewport must explain the product boundary and expose the six stages without relying on animation.

- [ ] **Step 5: Implement pipeline, assets, peers, sources, Scout, timeline, and Event pages**

Peers show capability state and evidence, never an overall rank. Event pages show DataProfile, affected stages, related assets/methods/peers, fact boundaries, and original Evidence. Timeline remains secondary.

- [ ] **Step 6: Remove old page generation and add the new 404 path**

Do not redirect old generic pages to unrelated new content. Return the static 404 page with links to key changes, pipeline, and search/find instructions.

- [ ] **Step 7: Verify and commit**

```bash
npm test -- --run tests/static-site-intelligence.test.ts tests/integration.test.ts tests/public-site-integrity.test.ts
npm run typecheck
git add src/pipeline/static-site/pages src/pipeline/static-site/pages.ts src/pipeline/static-site/render.ts src/pipeline/static-site/i18n.ts tests/static-site-intelligence.test.ts tests/integration.test.ts
git commit -m "feat: render embodied data product"
```

---

### Task 3: Implement the Six-Stage Visual System and Responsive Behavior

**Files:**

- Modify: `web/public/assets/app.css`
- Modify: `web/public/assets/core.js`
- Modify: `web/public/assets/timeline.js`
- Modify: `tests/static-site-intelligence.test.ts`
- Create: `tests/static-site-accessibility.test.ts`

**Interfaces:**

- The pipeline rail works as semantic ordered content without JavaScript and gains optional progressive interaction with JavaScript.

- [ ] **Step 1: Write failing semantic and accessibility assertions**

Assert one `main`, visible skip link, ordered pipeline structure, semantic tables with captions/headers, source-link names, focus-visible styles, and reduced-motion styles. Assert interactive controls have accessible names and preserve useful no-JS content.

- [ ] **Step 2: Run focused tests and observe RED**

```bash
npm test -- --run tests/static-site-accessibility.test.ts tests/static-site-intelligence.test.ts
```

- [ ] **Step 3: Add the visual tokens and pipeline rail**

Retain the current typography and lightweight card shell. Add one color/token per pipeline stage, a connected rail, evidence-state chips, and compact decision panels. Avoid decorative gradients or unrelated animation.

- [ ] **Step 4: Add progressive interaction**

Allow stage focus/filter and evidence disclosure. Preserve URL navigation, keyboard operation, and a complete no-JS reading path.

- [ ] **Step 5: Validate responsive states**

Inspect 390px, 768px, 1280px, and 1440px widths. The peer matrix may scroll horizontally with a visible affordance; primary navigation must not hide essential destinations.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- --run tests/static-site-accessibility.test.ts tests/static-site-intelligence.test.ts
npm run export
git add web/public/assets/app.css web/public/assets/core.js web/public/assets/timeline.js tests/static-site-accessibility.test.ts tests/static-site-intelligence.test.ts
git commit -m "feat: add embodied pipeline visual system"
```

---

### Task 4: Switch SEO, JSON-LD, Sitemap, RSS, llms.txt, and Integrity Validation

**Files:**

- Modify: `src/pipeline/static-site/pages.ts`
- Modify: `src/pipeline/static-site/llms.ts`
- Modify: `src/pipeline/public-site-integrity.ts`
- Modify: `src/pipeline/export.ts`
- Modify: `tests/static-site-seo.test.ts`
- Create: `tests/public-site-integrity.test.ts`
- Modify: `tests/public-content-fingerprint.test.ts`

**Interfaces:**

- All machine-readable surfaces describe the embodied-data product and contain only current public URLs and allowlisted facts.

- [ ] **Step 1: Write failing metadata and leak tests**

Assert Chinese and English title/description, canonical URLs, Open Graph fields, valid JSON-LD, current sitemap routes, embodied-only RSS entries, and `llms.txt` product boundary. Scan all generated text/JSON for legacy titles, old tracks, model pricing, local paths, secrets, and raw payload markers.

- [ ] **Step 2: Run focused tests and observe RED**

```bash
npm test -- --run tests/static-site-seo.test.ts tests/public-site-integrity.test.ts tests/public-content-fingerprint.test.ts
```

- [ ] **Step 3: Implement the machine-readable switch**

Use `WebSite`, `CollectionPage`, `Dataset`, `Organization`, and `Article` JSON-LD only where the allowlisted model supports the claim. Keep script-safe JSON serialization.

- [ ] **Step 4: Replace hard-coded integrity routes and tracks**

Validate the Route Contract, six pipeline slugs, expected DTO counts, evidence-link coverage, and zero legacy leaks from the exported artifact.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- --run tests/static-site-seo.test.ts tests/public-site-integrity.test.ts tests/public-content-fingerprint.test.ts tests/static-site-privacy.test.ts
npm run export
npm run public:validate
git add src/pipeline/static-site/pages.ts src/pipeline/static-site/llms.ts src/pipeline/public-site-integrity.ts src/pipeline/export.ts tests/static-site-seo.test.ts tests/public-site-integrity.test.ts tests/public-content-fingerprint.test.ts
git commit -m "feat: publish embodied machine-readable site"
```

---

### Task 5: Update the Release Record and Complete Local Acceptance

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `src/catalog/product.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/specs/2026-09-19-embodied-data-intelligence/TASKS.md`
- Create: `data/reports/embodied-data-public-switch.json`

**Interfaces:**

- The release report records corpus/object counts, six-stage coverage, evidence ratios, zero-leak result, public fingerprint, snapshot hash, and verification commands.

- [ ] **Step 1: Add failing release-note consistency assertions**

Extend `tests/release.test.ts` so the root Changelog and website unreleased entry describe the same user-visible switch, package metadata points to `susuyan/eai-pulse`, and no file claims active collectors or MySQL compatibility.

- [ ] **Step 2: Run the release test and observe RED**

```bash
npm test -- --run tests/release.test.ts
```

- [ ] **Step 3: Update both Changelog sources and product documentation**

Describe what is public, what remains shadow, the provenance-retention boundary, and the six new views. Update package description, homepage, repository, bugs URL, and keywords without changing the version. Keep the entry under `[Unreleased]` / `unreleased` until a separate release decision.

- [ ] **Step 4: Run the full local acceptance suite**

```bash
npm run check
npm run build
npm run db:snapshot -- restore
npm run export
npm run public:validate
npm run public:fingerprint
git diff --check
```

- [ ] **Step 5: Perform browser smoke and visual QA**

Serve `dist/` locally and inspect `/`, `/pipeline/`, `/assets/`, `/peers/`, `/sources/`, `/scout/`, one Event, `/en/`, and `/404.html` at desktop and mobile widths. Verify keyboard focus, reduced-motion behavior, source links, and no horizontal overflow except the labelled peer matrix.

- [ ] **Step 6: Write the verified release report and rerun integrity validation**

Generate the report from actual command outputs; do not hand-enter passing statuses. Re-run `npm run public:validate` after the report is written.

- [ ] **Step 7: Commit Phase 5**

```bash
git add CHANGELOG.md src/catalog/product.ts package.json README.md docs/specs/2026-09-19-embodied-data-intelligence/TASKS.md data/reports/embodied-data-public-switch.json tests/release.test.ts
git commit -m "docs: record embodied public switch"
```

---

### Task 6: Publish the Atomic PR and Verify the Live Site

**Files:**

- No new product files. This task operates on the verified branch and GitHub repository.

**Interfaces:**

- Repository: `susuyan/eai-pulse`.
- Branch: `codex/embodied-data-public-switch`.
- One non-Draft PR, normal merge, no force push, no GitHub Release.

- [ ] **Step 1: Rebase-free synchronization and final verification**

Fetch `origin/main`. If main advanced, merge it normally into the feature branch, resolve versioned snapshot conflicts by restoring the newest main snapshot and rerunning the migration, then rerun `npm run check` and `npm run build`. Do not rewrite history.

- [ ] **Step 2: Push and create the PR**

```bash
git push -u origin codex/embodied-data-public-switch
gh pr create --repo susuyan/eai-pulse --base main --head codex/embodied-data-public-switch \
  --title "feat: switch Agent Pulse to embodied data intelligence" --body-file - <<'EOF'
## Summary
- replace generic-AI current data with a reviewed embodied-data launch corpus
- enforce embodied relevance, readiness, quality, Scout, and workflow gates
- publish the pipeline-first static product and retain legacy provenance outside public paths

## Verification
- `npm run check`
- `npm run build`
- snapshot restore and round-trip
- desktop and mobile browser smoke
- generic-AI leak scan

## Operational boundary
New collectors remain in shadow. The launch corpus is editorially verified from original sources. Rollback uses the committed baseline manifest and a normal revert PR.
EOF
```

The body summarizes Phase 3–5, verification evidence, source-shadow boundary, migration/rollback, and screenshots. Attach the created PR to the Codex task.

- [ ] **Step 3: Wait for PR checks and merge only on success**

Use `gh pr checks --watch --repo susuyan/eai-pulse`. Resolve failures with new commits. Merge only after all required checks pass:

The generic-AI and embodied-data operational scores are not directly comparable because the approved migration retires the old production source set. If the regression gate detects this expected scope reset, authorize it only once when the checked base commit and its snapshot hash match `data/migrations/embodied-data-public-switch-baseline.json`, the current snapshot hash matches `data/reports/embodied-data-public-switch.json`, and a separate current-time evaluation passes every embodied quality gate with zero generic-AI leakage. Do not persist that transition evaluation; the post-merge Data Refresh owns the new operational baseline.

```bash
gh pr merge --repo susuyan/eai-pulse --merge --delete-branch=false
```

- [ ] **Step 4: Wait for Pages and validate the live product**

Wait for `pages.yml` at the merged SHA. Visit `https://susuyan.github.io/eai-pulse/` and confirm HTTP 200, subtitle, six pipeline stages, primary navigation, assets, peers, sources, Scout, Event, Changelog, sitemap, RSS, and `llms.txt`. Confirm old generic titles, six-domain cards, model-price entry, and old routes are absent.

- [ ] **Step 5: Run the four manual operations workflows serially**

```bash
gh workflow run source-audit.yml --repo susuyan/eai-pulse --ref main
gh workflow run quality-guard.yml --repo susuyan/eai-pulse --ref main
gh workflow run data-refresh.yml --repo susuyan/eai-pulse --ref main --field mode=incremental --field recovery=false
gh workflow run monitor.yml --repo susuyan/eai-pulse --ref main --field allow_notification=false
```

Wait for each real run to complete before starting the next state-dependent validation. Confirm the source-health Issue remains open and fresh, the snapshot commit does not reintroduce legacy public rows, and any Pages redeploy reaches the same embodied fingerprint.

- [ ] **Step 6: Apply the rollback rule if any hard gate fails**

Stop further workflows and create a normal revert PR against the atomic switch PR. Restore from the baseline Git revision and snapshot, run local checks, merge the revert after CI, wait for Pages, and verify the baseline public fingerprint. Never use reset, history rewrite, or force push.

- [ ] **Step 7: Record final evidence**

Report the PR URL, merge SHA, CI run, Pages run, four workflow runs, live public fingerprint, and verified routes. Completion requires all evidence, not merely HTTP 200.
