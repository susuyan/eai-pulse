import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface IntegrityIssue {
  code: string;
  path: string;
  message: string;
}

export interface PublicSiteIntegrityReport {
  ok: boolean;
  checkedAt: string;
  generatedAt: string | null;
  counts: {
    events: number;
    pipelineStages: number;
    datasets: number;
    standards: number;
    collectionMethods: number;
    peers: number;
    evolutionPhases: number;
    embodiedTrends: number;
    sources: number;
    scout: number;
    sitemapUrls: number;
    timelineCards: number;
  };
  issues: IntegrityIssue[];
}

const MAIN_ROUTES = [
  "",
  "pipeline/",
  "assets/",
  "peers/",
  "sources/",
  "scout/",
  "timeline/",
  "changelog/",
  "legal/",
] as const;

const PIPELINE_STAGES = [
  "demand-definition",
  "acquisition-route",
  "multimodal-capture",
  "production-operations",
  "data-engineering-standards",
  "quality-training-feedback",
] as const;

const DATA_PATHS = {
  events: "data/events.json",
  pipeline: "data/pipeline.json",
  assets: "data/assets.json",
  peers: "data/peers.json",
  evolution: "data/evolution.json",
  sources: "data/sources.json",
  scout: "data/scout.json",
  product: "data/product.json",
} as const;

const LEGACY_FILES = [
  "lines/index.html",
  "signals/index.html",
  "actors/index.html",
  "resources/index.html",
  "product/index.html",
  "industry-evolution/index.html",
  "data/timeline.json",
  "data/tracks.json",
  "data/signals.json",
  "data/actors.json",
  "data/resources.json",
  "data/narratives.json",
  "data/influencers.json",
] as const;

export async function validatePublicSite(
  distDir: string,
  checkedAt = new Date().toISOString(),
): Promise<PublicSiteIntegrityReport> {
  const issues: IntegrityIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const read = async (path: string) => {
    try {
      return await readFile(join(distDir, path), "utf8");
    } catch (error) {
      add("missing_file", path, error instanceof Error ? error.message : "File is missing");
      return "";
    }
  };
  const parse = <T>(path: string, text: string, fallback: T): T => {
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      add("invalid_json", path, error instanceof Error ? error.message : "Invalid JSON");
      return fallback;
    }
  };

  const dataText = Object.fromEntries(
    await Promise.all(
      Object.entries(DATA_PATHS).map(async ([key, path]) => [key, await read(path)] as const),
    ),
  ) as Record<keyof typeof DATA_PATHS, string>;
  const eventsPayload = parse<{
    generatedAt?: string;
    siteUrl?: string;
    events?: Array<{
      slug?: string;
      evidence?: Array<{ url?: string }>;
      dataProfile?: { evidenceStatus?: string };
    }>;
  }>(DATA_PATHS.events, dataText.events, {});
  const pipelinePayload = parse<{ generatedAt?: string; stages?: Array<{ slug?: string }> }>(
    DATA_PATHS.pipeline,
    dataText.pipeline,
    {},
  );
  const assetsPayload = parse<{
    generatedAt?: string;
    datasets?: unknown[];
    standards?: unknown[];
    collectionMethods?: unknown[];
  }>(DATA_PATHS.assets, dataText.assets, {});
  const peersPayload = parse<{ generatedAt?: string; peers?: Array<{ capabilities?: unknown[] }> }>(
    DATA_PATHS.peers,
    dataText.peers,
    {},
  );
  const evolutionPayload = parse<{
    schemaVersion?: unknown;
    generatedAt?: string;
    phases?: unknown;
    trends?: unknown;
  }>(DATA_PATHS.evolution, dataText.evolution, {});
  const sources = parse<unknown[]>(DATA_PATHS.sources, dataText.sources, []);
  const scoutPayload = parse<{ generatedAt?: string; insights?: unknown[] }>(
    DATA_PATHS.scout,
    dataText.scout,
    {},
  );
  const productPayload = parse<{ generatedAt?: string }>(DATA_PATHS.product, dataText.product, {});

  const events = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
  const stages = Array.isArray(pipelinePayload.stages) ? pipelinePayload.stages : [];
  const datasets = Array.isArray(assetsPayload.datasets) ? assetsPayload.datasets : [];
  const standards = Array.isArray(assetsPayload.standards) ? assetsPayload.standards : [];
  const collectionMethods = Array.isArray(assetsPayload.collectionMethods)
    ? assetsPayload.collectionMethods
    : [];
  const peers = Array.isArray(peersPayload.peers) ? peersPayload.peers : [];
  const evolutionPhases = Array.isArray(evolutionPayload.phases) ? evolutionPayload.phases : [];
  const embodiedTrends = Array.isArray(evolutionPayload.trends) ? evolutionPayload.trends : [];
  const scout = Array.isArray(scoutPayload.insights) ? scoutPayload.insights : [];
  const generatedAtValue = eventsPayload.generatedAt;
  const generatedAt = validTimestamp(generatedAtValue) ? generatedAtValue : null;
  if (!generatedAt) {
    add("invalid_generated_at", DATA_PATHS.events, "generatedAt is missing or invalid");
  }
  for (const [name, value] of Object.entries({
    pipeline: pipelinePayload.generatedAt,
    assets: assetsPayload.generatedAt,
    peers: peersPayload.generatedAt,
    evolution: evolutionPayload.generatedAt,
    scout: scoutPayload.generatedAt,
    product: productPayload.generatedAt,
  })) {
    if (value !== generatedAt) {
      add(
        "generation_mismatch",
        `data/${name}.json`,
        `Expected generatedAt ${generatedAt ?? "missing"}, received ${value ?? "missing"}`,
      );
    }
  }

  if (JSON.stringify(stages.map((stage) => stage.slug)) !== JSON.stringify(PIPELINE_STAGES)) {
    add("pipeline_stage_mismatch", DATA_PATHS.pipeline, "Pipeline stages are missing or unordered");
  }
  if (evolutionPayload.schemaVersion !== 1) {
    add("invalid_evolution_schema", DATA_PATHS.evolution, "schemaVersion must be 1");
  }
  if (!Array.isArray(evolutionPayload.phases)) {
    add("invalid_evolution_phases", DATA_PATHS.evolution, "phases must be an array");
  } else if (evolutionPhases.length < 5 || evolutionPhases.length > 7) {
    add("invalid_evolution_phase_count", DATA_PATHS.evolution, "Expected 5 through 7 phases");
  }
  if (!Array.isArray(evolutionPayload.trends)) {
    add("invalid_evolution_trends", DATA_PATHS.evolution, "trends must be an array");
  } else if (embodiedTrends.length < 8) {
    add("invalid_evolution_trend_count", DATA_PATHS.evolution, "Expected at least 8 trends");
  }
  for (const event of events) {
    const slug = String(event.slug ?? "");
    if (!slug || !event.dataProfile?.evidenceStatus) {
      add(
        "invalid_event",
        DATA_PATHS.events,
        `Event ${slug || "unknown"} lacks public data profile`,
      );
    }
    if (!event.evidence?.length || event.evidence.some((item) => !isPublicHttpUrl(item.url))) {
      add(
        "invalid_event_evidence",
        DATA_PATHS.events,
        `Event ${slug || "unknown"} lacks public evidence`,
      );
    }
  }

  const sensitivePattern =
    /"(?:token|secret|password|cookie|authorization|api[_-]?key|raw[_-]?payload|payload_json|config_json)"\s*:|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\/Users\/[^/]+\/|\/home\/runner\//i;
  for (const [name, text] of Object.entries(dataText)) {
    if (sensitivePattern.test(text)) {
      add(
        "private_material",
        DATA_PATHS[name as keyof typeof DATA_PATHS],
        "Public JSON contains private material",
      );
    }
    validateNoLegacyLeak(DATA_PATHS[name as keyof typeof DATA_PATHS], text, add, true);
  }
  if (containsForbiddenEvolutionField(evolutionPayload)) {
    add(
      "private_evolution_field",
      DATA_PATHS.evolution,
      "Evolution JSON exceeds the public allowlist",
    );
  }
  if (/legacy-ai|industry-narratives|six strategic lines|model pricing/i.test(dataText.evolution)) {
    add("legacy_evolution_content", DATA_PATHS.evolution, "Evolution JSON contains legacy content");
  }
  await validateEvolutionReferences(
    evolutionPhases,
    embodiedTrends,
    new Set(events.map((event) => String(event.slug ?? "")).filter(Boolean)),
    distDir,
    add,
  );

  for (const path of LEGACY_FILES) {
    if (await exists(join(distDir, path))) {
      add("legacy_public_file", path, "Legacy public route or DTO is still exported");
    }
  }

  const pageHtml = new Map<string, string>();
  for (const localePrefix of ["", "en/"] as const) {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const route of MAIN_ROUTES) {
      const path = pagePath(localePrefix, route);
      const html = await read(path);
      pageHtml.set(path, html);
      validatePageHead(path, html, add);
      validateJsonLd(path, html, add);
      validateUniqueMetadata(path, html, titles, descriptions, add);
      validateNoLegacyLeak(path, html, add);
    }
    const notFoundPath = `${localePrefix}404.html`;
    const notFound = await read(notFoundPath);
    pageHtml.set(notFoundPath, notFound);
    validatePageHead(notFoundPath, notFound, add);
    validateJsonLd(notFoundPath, notFound, add);
  }

  const eventRoutes = events.map((event) => `events/${String(event.slug ?? "")}/`);
  for (const route of eventRoutes) {
    for (const localePrefix of ["", "en/"] as const) {
      const path = pagePath(localePrefix, route);
      const html = await read(path);
      pageHtml.set(path, html);
      validatePageHead(path, html, add);
      validateJsonLd(path, html, add);
      validateNoLegacyLeak(path, html, add);
      if (!html.includes('"@type":"Article"')) {
        add("missing_article_json_ld", path, "Event page has no Article JSON-LD");
      }
    }
  }

  const timelineHtml = pageHtml.get("timeline/index.html") ?? "";
  const timelineCards = timelineHtml.match(/<article data-event=/g)?.length ?? 0;
  assertCount("timeline/index.html", timelineCards, events.length, add);
  assertCount(
    "pipeline/index.html",
    (pageHtml.get("pipeline/index.html") ?? "").match(/<li id="[^"]+" data-pipeline-stage=/g)
      ?.length ?? 0,
    stages.length,
    add,
  );
  assertCount(
    "assets/index.html",
    (pageHtml.get("assets/index.html") ?? "").match(/class="asset-card"/g)?.length ?? 0,
    datasets.length + standards.length + collectionMethods.length,
    add,
  );
  assertCount(
    "peers/index.html",
    (pageHtml.get("peers/index.html") ?? "").match(/<th scope="row">/g)?.length ?? 0,
    peers.reduce((sum, peer) => sum + (peer.capabilities?.length ?? 0), 0),
    add,
  );
  assertCount(
    "sources/index.html",
    (pageHtml.get("sources/index.html") ?? "").match(/class="source-card"/g)?.length ?? 0,
    sources.length,
    add,
  );
  assertCount(
    "scout/index.html",
    (pageHtml.get("scout/index.html") ?? "").match(/class="scout-card"/g)?.length ?? 0,
    scout.length,
    add,
  );

  const siteUrl = normalizeSiteUrl(eventsPayload.siteUrl);
  if (!siteUrl) add("invalid_site_url", DATA_PATHS.events, "siteUrl must use HTTPS");
  const llmsText = await read("llms.txt");
  if (siteUrl) validateLlmsTxt(llmsText, siteUrl, add);
  validateNoLegacyLeak("llms.txt", llmsText, add, true);

  const feedText = await read("feed.xml");
  if (siteUrl) validateRss(feedText, events, siteUrl, add);
  validateNoLegacyLeak("feed.xml", feedText, add, true);

  const sitemapText = await read("sitemap.xml");
  const sitemapUrls = new Set(
    [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeXml(match[1] ?? "")),
  );
  if (siteUrl) {
    const expectedRoutes = [...MAIN_ROUTES, ...eventRoutes];
    const expectedUrls = new Set(
      expectedRoutes.flatMap((route) =>
        ["", "en/"].map((localePrefix) => new URL(`${localePrefix}${route}`, siteUrl).toString()),
      ),
    );
    for (const url of expectedUrls) {
      if (!sitemapUrls.has(url)) add("sitemap_missing_url", "sitemap.xml", url);
    }
    for (const url of sitemapUrls) {
      if (!expectedUrls.has(url)) add("sitemap_unexpected_url", "sitemap.xml", url);
    }
    if (sitemapUrls.has(new URL("404.html", siteUrl).toString())) {
      add("sitemap_404", "sitemap.xml", "404 must not be indexed");
    }
  }

  return {
    ok: issues.length === 0,
    checkedAt,
    generatedAt,
    counts: {
      events: events.length,
      pipelineStages: stages.length,
      datasets: datasets.length,
      standards: standards.length,
      collectionMethods: collectionMethods.length,
      peers: peers.length,
      evolutionPhases: evolutionPhases.length,
      embodiedTrends: embodiedTrends.length,
      sources: sources.length,
      scout: scout.length,
      sitemapUrls: sitemapUrls.size,
      timelineCards,
    },
    issues,
  };
}

export async function writePublicSiteIntegrityReport(
  path: string,
  report: PublicSiteIntegrityReport,
): Promise<void> {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function validatePageHead(
  path: string,
  html: string,
  add: (code: string, path: string, message: string) => void,
): void {
  const requirements: Array<[string, RegExp]> = [
    ["title", /<title>[^<]+<\/title>/g],
    ["description", /<meta name="description" content="[^"]+">/g],
    ["canonical", /<link rel="canonical" href="[^"]+">/g],
    ["Open Graph title", /<meta property="og:title" content="[^"]+">/g],
    ["Open Graph description", /<meta property="og:description" content="[^"]+">/g],
    ["Open Graph URL", /<meta property="og:url" content="[^"]+">/g],
    ["zh-CN hreflang", /hreflang="zh-CN"/g],
    ["en hreflang", /hreflang="en"/g],
    ["x-default hreflang", /hreflang="x-default"/g],
    ["llms.txt discovery", /<link rel="alternate" type="text\/plain" href="[^"]*llms\.txt"/g],
  ];
  for (const [label, pattern] of requirements) {
    const count = html.match(pattern)?.length ?? 0;
    if (count !== 1) add("invalid_page_head", path, `Expected one ${label}, found ${count}`);
  }
}

function validateUniqueMetadata(
  path: string,
  html: string,
  titles: Set<string>,
  descriptions: Set<string>,
  add: (code: string, path: string, message: string) => void,
): void {
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  if (title) {
    if (titles.has(title)) add("duplicate_title", path, title);
    titles.add(title);
  }
  if (description) {
    if (descriptions.has(description)) add("duplicate_description", path, description);
    descriptions.add(description);
  }
}

function validateJsonLd(
  path: string,
  html: string,
  add: (code: string, path: string, message: string) => void,
): void {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) add("missing_json_ld", path, "No JSON-LD block found");
  for (const block of blocks) {
    try {
      JSON.parse(block[1] ?? "");
    } catch (error) {
      add("invalid_json_ld", path, error instanceof Error ? error.message : "Invalid JSON-LD");
    }
  }
}

function validateLlmsTxt(
  text: string,
  siteUrl: string,
  add: (code: string, path: string, message: string) => void,
): void {
  const path = "llms.txt";
  if (!text.startsWith("# Agent Pulse\n\n> ")) {
    add("invalid_llms_txt", path, "Expected an H1 followed by a blockquote summary");
  }
  for (const boundary of [
    "embodied-data production",
    "Events are verified facts",
    "hypotheses, not as verified facts",
    "original evidence URLs",
    "raw collector payloads",
  ]) {
    if (!text.includes(boundary)) add("invalid_llms_txt", path, `Missing boundary: ${boundary}`);
  }
  for (const resource of [...Object.values(DATA_PATHS), "sitemap.xml", "feed.xml"] as const) {
    const expected = new URL(resource, siteUrl).toString();
    if (!text.includes(`](${expected})`)) {
      add("invalid_llms_txt", path, `Missing public resource ${expected}`);
    }
  }
  const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1] ?? "");
  for (const link of links) {
    try {
      if (new URL(link).protocol !== "https:")
        add("invalid_llms_txt", path, `Non-HTTPS link: ${link}`);
    } catch {
      add("invalid_llms_txt", path, `Invalid link: ${link}`);
    }
  }
}

function validateRss(
  text: string,
  events: Array<{ slug?: string }>,
  siteUrl: string,
  add: (code: string, path: string, message: string) => void,
): void {
  if (!text.includes('<rss version="2.0">')) add("invalid_rss", "feed.xml", "Missing RSS root");
  assertCount("feed.xml", text.match(/<item>/g)?.length ?? 0, events.length, add);
  for (const event of events) {
    const url = new URL(`events/${String(event.slug ?? "")}/`, siteUrl).toString();
    if (!text.includes(`<link>${escapeXml(url)}</link>`)) {
      add("rss_missing_event", "feed.xml", url);
    }
  }
}

function validateNoLegacyLeak(
  path: string,
  text: string,
  add: (code: string, path: string, message: string) => void,
  strict = false,
): void {
  const routePattern =
    /(?:href|src)="[^"]*(?:\/lines\/|\/signals\/|\/actors\/|\/resources\/|\/product\/|\/industry-evolution\/)|data\/(?:timeline|tracks|signals|actors|resources|narratives|influencers)\.json/i;
  const strictPattern =
    /\/(?:lines|signals|actors|resources|product|industry-evolution)\/|model pricing|模型价格|六个领域趋势|six strategic lines|tech-evolution|agi-progress|commercialization|investing|global-innovation|model-economics|GPT-5\.6/i;
  if (routePattern.test(text) || (strict && strictPattern.test(text))) {
    add("legacy_public_leak", path, "Legacy route, DTO, or product framing remains public");
  }
  if (/<<<<<<<|__PREFIX__|\/Users\//.test(text)) {
    add(
      "unsafe_page_output",
      path,
      "Conflict marker, template token, or local path remains public",
    );
  }
}

async function validateEvolutionReferences(
  phases: unknown[],
  trends: unknown[],
  eventSlugs: Set<string>,
  distDir: string,
  add: (code: string, path: string, message: string) => void,
): Promise<void> {
  const relations: unknown[] = [];
  for (const phase of phases) {
    if (!isRecord(phase)) {
      add("invalid_evolution_phase", DATA_PATHS.evolution, "Each phase must be an object");
      continue;
    }
    collectEvolutionRelations(phase.events, relations, add, "phase events");
    collectEvolutionRelations(phase.counterEvents, relations, add, "phase counterEvents");
    if (!isRecord(phase.stageImpacts)) {
      add(
        "invalid_evolution_stage_impacts",
        DATA_PATHS.evolution,
        "Phase stageImpacts must be an object",
      );
      continue;
    }
    for (const stage of PIPELINE_STAGES) {
      const impact = phase.stageImpacts[stage];
      if (!isRecord(impact)) {
        add(
          "invalid_evolution_stage_impact",
          DATA_PATHS.evolution,
          `Missing stage impact for ${stage}`,
        );
        continue;
      }
      collectEvolutionRelations(impact.events, relations, add, `${stage} stage events`);
    }
  }
  for (const trend of trends) {
    if (!isRecord(trend)) {
      add("invalid_embodied_trend", DATA_PATHS.evolution, "Each trend must be an object");
      continue;
    }
    collectEvolutionRelations(trend.events, relations, add, "trend events");
    collectEvolutionRelations(trend.counterEvents, relations, add, "trend counterEvents");
  }
  for (const relation of relations) {
    if (
      !isRecord(relation) ||
      typeof relation.slug !== "string" ||
      !eventSlugs.has(relation.slug)
    ) {
      add(
        "unknown_evolution_event",
        DATA_PATHS.evolution,
        `Evolution relation does not resolve to a published Event: ${String(
          isRecord(relation) ? relation.slug : "unknown",
        )}`,
      );
      continue;
    }
    if (!(await exists(join(distDir, `events/${relation.slug}/index.html`)))) {
      add(
        "missing_evolution_event_page",
        DATA_PATHS.evolution,
        `Evolution relation has no generated Event detail page: ${relation.slug}`,
      );
    }
  }
}

function collectEvolutionRelations(
  value: unknown,
  relations: unknown[],
  add: (code: string, path: string, message: string) => void,
  label: string,
): void {
  if (!Array.isArray(value)) {
    add("invalid_evolution_relations", DATA_PATHS.evolution, `${label} must be an array`);
    return;
  }
  relations.push(...value);
}

function containsForbiddenEvolutionField(value: unknown): boolean {
  const forbidden = new Set([
    "id",
    "url",
    "sourceUrl",
    "evidence",
    "evidenceUrl",
    "rawPayload",
    "privateState",
    "sourceId",
    "config",
  ]);
  if (Array.isArray(value)) return value.some(containsForbiddenEvolutionField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      forbidden.has(key) ||
      key.endsWith("Id") ||
      key.endsWith("_id") ||
      containsForbiddenEvolutionField(nested),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertCount(
  path: string,
  actual: number,
  expected: number,
  add: (code: string, path: string, message: string) => void,
): void {
  if (actual !== expected)
    add("content_count_mismatch", path, `Expected ${expected}, found ${actual}`);
}

function pagePath(localePrefix: string, route: string): string {
  return `${localePrefix}${route}index.html`;
}

function normalizeSiteUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString().endsWith("/") ? url.toString() : `${url.toString()}/`;
  } catch {
    return null;
  }
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isPublicHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
