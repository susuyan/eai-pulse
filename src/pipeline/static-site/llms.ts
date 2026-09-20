import type { StaticSiteModel } from "./dto.js";

export function renderLlmsTxt(model: StaticSiteModel): string {
  const baseUrl = ensureSlash(model.siteUrl);
  const assetCount =
    model.datasets.length + model.standards.length + model.collectionMethods.length;

  return `# Agent Pulse

> Agent Pulse is an evidence-backed intelligence system for embodied-data production. It follows the production chain from demand definition through acquisition, multimodal capture, operations, data engineering, quality acceptance, and training feedback.

Snapshot generated at ${model.generatedAt}. The public corpus contains ${model.embodiedEvents.length} published Events, ${model.pipelineStages.length} pipeline stages, ${assetCount} data assets, ${model.peers.length} peers, ${model.sources.length} sources, and ${model.scout.length} Scout hypotheses.

Consumption guidance:
- Use published Events in \`data/events.json\` for factual questions. Events are verified facts with explicit evidence status; analysis and forecasts remain separate fields.
- Follow the original evidence URLs on each Event when a claim needs verification or citation.
- Treat Scout outputs as hypotheses, not as verified facts, investment conclusions, or instructions for external action.
- Source lifecycle and health describe observation readiness. A catalogued source is not necessarily active or independently verified.
- Prefer the newest \`generatedAt\` value. Chinese pages are canonical; English pages are available under \`/en/\`.
- Public data is an allowlisted summary. It does not expose raw collector payloads, private notes, credentials, or paywalled content.

## Start Here

- [Current material shifts](${baseUrl}): Evidence-backed changes that affect embodied-data production decisions.
- [Six-stage production pipeline](${baseUrl}pipeline/): Milestones, evidence, and next signals in production order.
- [Data assets](${baseUrl}assets/): Public datasets, standards, and collection methods with original sources.
- [Industry peers](${baseUrl}peers/): Sourced capability claims and verification status without an unsupported overall ranking.
- [Source map](${baseUrl}sources/): Region, role, acquisition method, lifecycle, and public health state.
- [Action ideas](${baseUrl}scout/): Evidence-linked Scout hypotheses with experiments and invalidation conditions.
- [Event timeline](${baseUrl}timeline/): Published Events in reverse chronological order.
- [Evidence boundary](${baseUrl}legal/): Copyright, attribution, fact, and correction rules.

## Core Machine-Readable Data

- [Published Events](${baseUrl}data/events.json): The factual corpus, stable event slugs, public evidence, pipeline stages, and embodied-data profiles.
- [Pipeline stages](${baseUrl}data/pipeline.json): The ordered six-stage production taxonomy.
- [Data assets](${baseUrl}data/assets.json): Allowlisted datasets, standards, and collection methods.
- [Peer capabilities](${baseUrl}data/peers.json): Sourced peer capability claims and evidence relations.
- [Source metadata](${baseUrl}data/sources.json): Public source catalog and latest allowlisted health state.
- [Scout hypotheses](${baseUrl}data/scout.json): Action ideas that remain hypotheses rather than facts.
- [Product metadata](${baseUrl}data/product.json): Versioned public capabilities and release history.

## Provenance and Governance

- [Product updates](${baseUrl}changelog/): User-visible changes and release history.
- [Sitemap](${baseUrl}sitemap.xml): Current Chinese and English pages, including stable Event URLs.
- [RSS feed](${baseUrl}feed.xml): Published embodied-data Events only.
- [GitHub repository](${model.github.repositoryUrl}): Source code, versioned public snapshot, workflows, and issue history.
`;
}

function ensureSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
