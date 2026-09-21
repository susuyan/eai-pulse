import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { transform } from "esbuild";
import type { Kysely } from "kysely";
import { influencerCatalog } from "../catalog/influencers.js";
import { capabilities, productVersion, releases, roadmap } from "../catalog/product.js";
import type { AppConfig } from "../config/env.js";
import { parseJson, Repository } from "../db/repository.js";
import type { DatabaseSchema } from "../db/types.js";
import { evaluateSystem, latestEvaluation } from "./evaluate.js";
import { loadResearchImpactReport, researchImpactAssessmentForEvent } from "./research-impact.js";
import { loadMergedIndustryNarratives } from "./stage-promotion.js";
import type {
  EnrichedEvent,
  IndustryNarratives,
  ProductData,
  PublicActor,
  PublicInfluencer,
  PublicResource,
  PublicScoutInsight,
  PublicSignal,
  PublicSource,
  PublicTrack,
  StaticSiteModel,
} from "./static-site/dto.js";
import { buildEmbodiedPublicData } from "./static-site/embodied-intelligence.js";
import { githubDataAtBuildTime } from "./static-site/github.js";
import { summarizeSourceCoverageGaps } from "./static-site/intelligence.js";
import { renderLlmsTxt } from "./static-site/llms.js";
import type { StaticPage } from "./static-site/pages.js";
import { renderStaticPages } from "./static-site/pages.js";

function clarifyLegacyScoutCopy(insight: PublicScoutInsight): PublicScoutInsight {
  const observation = insight.observation.replace(
    /已进入已发布事件，并在影响力 (\d+)、业务价值 (\d+) 的维度上形成值得继续验证的信号。/,
    "已发布。当前评分为行业影响 $1、业务价值 $2，适合继续做小规模验证。",
  );
  const title = insight.title
    .replace(/^用「(.+)」补齐一个会改变判断的认知缺口$/, "围绕「$1」核对一个关键未知项")
    .replace(/^把「(.+)」做成一份可复用的判断框架$/, "围绕「$1」整理一份可持续更新的分析")
    .replace(
      /^把「(.+)」沉淀成一个可复用的数据或工具资产$/,
      "围绕「$1」制作一个可复用的数据集或工具",
    )
    .replace(/^围绕「(.+)」建立一条可持续验证的公开观点$/, "围绕「$1」发布一条可持续核验的观点")
    .replace(/^从「(.+)」验证一个窄而深的创业入口$/, "围绕「$1」验证一个具体创业场景");
  const replacements = new Map([
    [
      "真正稀缺的不是知道事件发生，而是能解释其技术前提、适用边界和反例。把未知项拆成可验证问题，可以减少团队被发布叙事带着走。",
      "事件已经公开，但它的技术前提、适用边界和反例可能仍不清楚。把未知项拆成可验证的问题，有助于团队独立评估发布方的说法。",
    ],
    [
      "市场会快速复述发布本身，但缺少把事实、反证、技术门槛和业务影响放在一起的中文分析。先建立证据框架，可能形成持续内容栏目。",
      "市场会快速复述发布内容。把事实、反例、技术条件和业务影响放在一起，能为中文读者提供更完整的判断依据。",
    ],
    [
      "如果该变化能被转译为当前组织的客户、成本或研发指标，就有机会从行业信息变成可见的工作杠杆。",
      "将这项变化映射到客户、成本或研发指标，可以检验它是否适用于当前组织。",
    ],
    [
      "事件背后的比较、评测或迁移问题会重复出现。将一次分析固化为结构化数据、检查器或模板，比继续追踪零散消息更有长期价值。",
      "事件背后的比较、评测或迁移问题会重复出现。把分析整理为结构化数据、检查器或模板，便于后续重复使用。",
    ],
    [
      "大多数传播只复述结论。把事实、非共识判断、反证和后续指标同时公开，可能形成更可信的专业影响力，而不是一次性热点表达。",
      "公开事实、不同判断、反证和后续指标，可以让观点持续接受检验，并减少对短期热点的依赖。",
    ],
    [
      "事件可能让过去成本过高或能力不足的用户问题首次可解。真正机会不在复刻发布，而在找到愿意为结果付费的窄场景与分发路径。",
      "这项变化可能让部分过去成本过高或能力不足的问题变得可解。验证重点是找到愿意为结果付费的具体场景和可行的获客路径。",
    ],
  ]);
  return {
    ...insight,
    title,
    observation,
    hypothesis: replacements.get(insight.hypothesis) ?? insight.hypothesis,
    whyNow:
      insight.whyNow ===
      "能力、产业叙事和行动窗口正在同一时间发生变化；未来 7 天的新发布、采用和成本信号将决定它是短期噪声还是结构性转折。"
        ? "未来 7 天可重点观察新发布、采用情况和成本变化，用这些信号判断影响能否持续。"
        : insight.whyNow,
    counterSignals:
      insight.counterSignals ===
      "当前证据仍可能偏向发布方叙事；如果独立采用、真实成本或持续性指标没有出现，应下调判断。"
        ? "现有证据可能偏向发布方。如果没有独立采用、真实成本或持续性数据，应降低优先级。"
        : insight.counterSignals,
  };
}

export async function exportStaticSite(db: Kysely<DatabaseSchema>, config: AppConfig) {
  const repository = new Repository(db);
  const latest = await latestEvaluation(db);
  const evaluation =
    latest ??
    (await evaluateSystem(db, {
      asOf: new Date(),
      gateMode: "operational",
      persist: true,
    }));
  const narratives = await loadMergedIndustryNarratives(config.rootDir);
  const [events, tracks, actors, resources, scout, latestSourceChecks, signals] = await Promise.all(
    [
      repository.publicEvents(),
      repository.listTracks(),
      repository.listActors(),
      repository.listResources(),
      repository.publicScoutInsights(),
      repository.latestSourceChecks(),
      repository.publicSignals(),
    ],
  );
  const sources = (await repository.listSources()).filter(
    (source) => source.content_scope === "embodied-data" && source.lifecycle_status !== "retired",
  );

  const generatedAt = new Date().toISOString();
  const researchImpactReport = await loadResearchImpactReport(
    join(config.rootDir, "data/reports/research-impact.json"),
  );
  const eventRelations = await repository.publicEventRelations(events.map((event) => event.id));
  const embodiedData = await buildEmbodiedPublicData(db, repository, {
    events,
    tracks,
    actors,
    eventTracks: eventRelations.tracks,
  });
  const enrichedEvents = events.map((event) => ({
    ...event,
    tracks: eventRelations.tracks.get(event.id) ?? [],
    actors: eventRelations.actors.get(event.id) ?? [],
    researchImpact: researchImpactAssessmentForEvent(event, researchImpactReport, generatedAt),
  })) as EnrichedEvent[];
  const publicScout = (scout as PublicScoutInsight[]).map(clarifyLegacyScoutCopy);
  const publicTracks: PublicTrack[] = tracks.map((track) => ({
    slug: track.slug,
    name: track.name,
    description: track.description,
    kind: track.kind,
    perspective: track.perspective,
    color: track.color,
    icon: track.icon,
  }));
  const checksBySourceId = new Map(latestSourceChecks.map((check) => [check.source_id, check]));
  const publicSources: PublicSource[] = sources.map((source) => {
    const manual = source.acquisition === "manual" || source.adapter === "manual";
    const mapStatus =
      manual && source.map_status === "integrated" ? "restricted" : source.map_status;
    const check = checksBySourceId.get(source.id);
    return {
      slug: source.slug,
      name: source.name,
      homepageUrl: source.homepage_url,
      category: source.source_category,
      region: source.region,
      tier: source.tier,
      role: source.role,
      acquisition: source.acquisition,
      topics: parsePublicStringArray(source.topics_json),
      mapStatus,
      pipelineStages: parsePublicPipelineStages(source.pipeline_stages_json),
      substituteFor: parsePublicStringArray(source.substitute_for_json),
      restrictionNote: source.restriction_note,
      maintenanceStatus: source.maintenance_status,
      lifecycle: source.lifecycle_status,
      observationEnabled: source.observation_enabled === 1,
      qualityScore: source.quality_score,
      cadence: source.cadence,
      healthStatus:
        manual || mapStatus === "restricted" ? "unchecked" : normalizePublicHealth(check?.status),
      lastCheckedAt: check?.finished_at ?? null,
      latestItemAt: check?.latest_item_at ?? null,
      healthErrorCode: check?.error_code ?? null,
    };
  });
  const publicActors: PublicActor[] = actors.map((actor) => ({
    slug: actor.slug,
    name: actor.name,
    type: actor.actor_type,
    region: actor.region,
    scale: actor.scale,
    domains: parseJson(actor.domains_json, []),
    tableScore: actor.table_score,
    websiteUrl: actor.website_url,
  }));
  const publicInfluencers: PublicInfluencer[] = influencerCatalog.map((influencer) => ({
    slug: influencer.slug,
    name: influencer.name,
    region: influencer.region,
    focus: [...influencer.focus],
    feedSourceSlug: influencer.feedSourceSlug ?? null,
    profiles: influencer.profiles.map((profile) => ({ ...profile })),
  }));
  const publicResources: PublicResource[] = resources.map((resource) => ({
    slug: resource.slug,
    provider: resource.provider,
    model: resource.model,
    type: resource.resource_type,
    audience: resource.audience,
    region: resource.region,
    currency: resource.currency,
    inputPrice: resource.input_price,
    outputPrice: resource.output_price,
    unit: resource.unit,
    planName: resource.plan_name,
    purchaseUrl: resource.purchase_url,
    sourceUrl: resource.source_url,
    comparisonUrl: resource.external_comparison_url,
    riskLevel: resource.risk_level,
    verifiedAt: resource.verified_at,
  }));
  const publicSignals: PublicSignal[] = signals
    .filter((signal) => safePublicUrl(signal.url))
    .map((signal) => ({
      title: signal.title,
      description: briefPublicText(signal.summary),
      url: signal.url,
      sourceSlug: signal.sourceSlug,
      sourceName: signal.sourceName,
      sourceTier: signal.sourceTier,
      sourceRole: signal.sourceRole,
      sourceRegion: signal.sourceRegion,
      publishedAt: signal.publishedAt,
      collectedAt: signal.collectedAt,
      category: signal.category,
      tags: parseJson(signal.tagsJson, []),
      language: signal.language,
    }));
  const github = await githubDataAtBuildTime(productVersion, {
    allowNetwork: config.NODE_ENV !== "test" && process.env.VITEST !== "true",
  });
  const productData: ProductData = {
    version: productVersion,
    generatedAt,
    capabilities: capabilities.map((item) => ({ ...item })),
    roadmap: roadmap.map((stage) => ({ ...stage, milestones: [...stage.milestones] })),
    releases: releases.map((release) => ({
      ...release,
      capabilities: [...release.capabilities],
      changes: [...release.changes],
    })),
    evaluation: evaluation
      ? {
          status: evaluation.status,
          overallScore: evaluation.overallScore,
          rawWeightedScore: evaluation.rawWeightedScore,
          evidenceCoverage: evaluation.evidenceCoverage,
          dimensions: evaluation.dimensions,
          finishedAt: evaluation.finishedAt,
        }
      : null,
    sourceCoverage: {
      total: sources.length,
      active: sources.filter((source) => source.lifecycle_status === "active").length,
      observing: sources.filter((source) => source.observation_enabled === 1).length,
      candidate: sources.filter((source) => source.maintenance_status === "candidate").length,
      regions: [...new Set(sources.map((source) => source.region))],
      categories: [...new Set(sources.map((source) => source.source_category))],
    },
  };
  const publicProductData = toEmbodiedPublicProduct(productData);

  await rm(config.distDir, { recursive: true, force: true });
  await mkdir(join(config.distDir, "data"), { recursive: true });
  await cp(join(config.rootDir, "web/public"), config.distDir, { recursive: true });
  await optimizeStaticAssets(config.distDir);

  await Promise.all([
    writeJson(join(config.distDir, "data/events.json"), {
      schemaVersion: 1,
      generatedAt,
      siteUrl: config.PUBLIC_SITE_URL,
      events: embodiedData.events,
    }),
    writeJson(join(config.distDir, "data/pipeline.json"), {
      schemaVersion: 1,
      generatedAt,
      stages: embodiedData.pipelineStages,
    }),
    writeJson(join(config.distDir, "data/assets.json"), {
      schemaVersion: 1,
      generatedAt,
      datasets: embodiedData.datasets,
      standards: embodiedData.standards,
      collectionMethods: embodiedData.collectionMethods,
    }),
    writeJson(join(config.distDir, "data/peers.json"), {
      schemaVersion: 1,
      generatedAt,
      peers: embodiedData.peers,
    }),
    writeJson(join(config.distDir, "data/scout.json"), {
      schemaVersion: 1,
      generatedAt,
      insights: publicScout,
    }),
    writeJson(join(config.distDir, "data/product.json"), {
      schemaVersion: 1,
      ...publicProductData,
    }),
    writeJson(join(config.distDir, "data/sources.json"), publicSources),
  ]);

  const model: StaticSiteModel = {
    siteUrl: config.PUBLIC_SITE_URL,
    generatedAt,
    events: enrichedEvents,
    tracks: publicTracks,
    actors: publicActors,
    resources: publicResources,
    sources: publicSources,
    signals: publicSignals,
    influencers: publicInfluencers,
    scout: publicScout,
    narratives: {
      horizon: { ...narratives.horizon },
      eras: narratives.eras.map((era) => ({
        ...era,
        projects: era.projects.map((project) => ({ ...project })),
      })),
      tracks: narratives.tracks.map((track) => ({
        ...track,
        stages: track.stages.map((stage) => ({ ...stage })),
        lenses: track.lenses.map((lens) => ({
          ...lens,
          implications: [...lens.implications],
          actions: [...lens.actions],
          watch: [...lens.watch],
          evidenceSlugs: [...lens.evidenceSlugs],
        })),
      })),
    } satisfies IndustryNarratives,
    product: publicProductData,
    github,
    embodiedEvents: embodiedData.events,
    pipelineStages: embodiedData.pipelineStages,
    datasets: embodiedData.datasets,
    standards: embodiedData.standards,
    collectionMethods: embodiedData.collectionMethods,
    peers: embodiedData.peers,
    sourceCoverageGaps: summarizeSourceCoverageGaps(publicSources, embodiedData.pipelineStages),
  };

  const allPages = renderStaticPages(model);
  await writeAllPages(allPages, config.distDir);

  await Promise.all([
    writeSitemap(allPages, config.PUBLIC_SITE_URL, config.distDir),
    writeRobotsTxt(config.PUBLIC_SITE_URL, config.distDir),
    writeRssFeed(embodiedData.events, config.PUBLIC_SITE_URL, generatedAt, config.distDir),
    writeFile(join(config.distDir, "llms.txt"), renderLlmsTxt(model), "utf8"),
  ]);

  return {
    events: enrichedEvents.length,
    tracks: tracks.length,
    actors: actors.length,
    resources: resources.length,
    scout: scout.length,
    sources: sources.length,
    signals: publicSignals.length,
    version: productVersion,
    generatedAt,
  };
}

function toEmbodiedPublicProduct(product: ProductData): ProductData {
  const capabilitySlugs = new Set([
    "continuous-data-refresh",
    "embodied-data-foundation",
    "primary-source-gate",
    "source-lifecycle",
    "resilient-fetch",
    "source-observability",
    "source-contract",
    "incremental-sync",
    "normalize",
    "dedupe",
    "event-clustering",
    "event-convergence",
    "claim-evidence",
    "scout",
    "publication-readiness",
    "static-release",
    "content-rights-boundary",
    "repository-snapshot",
    "security",
  ]);
  const relevantReleaseText =
    /具身数据|数据管线|数据资产|同行能力|content scope|Dataset|Standard|CollectionMethod|public switch|readiness/i;
  const legacyOrStaleText =
    /模型价格|六个领域|尚未切换|尚未进入当前数据|model pricing|six strategic lines/i;

  return {
    ...product,
    capabilities: product.capabilities.filter((item) => capabilitySlugs.has(item.slug)),
    roadmap: [],
    releases: product.releases
      .filter((release) => release.status === "unreleased")
      .map((release) => ({
        ...release,
        capabilities: release.capabilities.filter(
          (item) => relevantReleaseText.test(item) && !legacyOrStaleText.test(item),
        ),
        changes: release.changes.filter(
          (item) => relevantReleaseText.test(item) && !legacyOrStaleText.test(item),
        ),
      })),
    evaluation: null,
  };
}

function safePublicUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function briefPublicText(value: string): string {
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= 220 ? text : `${text.slice(0, 217).trimEnd()}…`;
}

async function writeAllPages(pages: StaticPage[], distDir: string): Promise<void> {
  await Promise.all(
    pages.map(async (page) => {
      const path = join(distDir, page.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, page.content, "utf8");
    }),
  );
}

async function writeSitemap(pages: StaticPage[], siteUrl: string, distDir: string): Promise<void> {
  const baseUrl = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;

  // Collect unique routes from all pages
  const routes = new Map<string, { zhPath: string; enPath: string | null }>();

  for (const page of pages) {
    const path = page.path.endsWith("404.html") ? null : page.path;
    if (!path) continue;

    if (path.startsWith("en/")) {
      // en version
      const zhPath = path.slice(3); // remove "en/" prefix
      const existing = routes.get(zhPath);
      if (existing) {
        existing.enPath = path;
      } else {
        routes.set(zhPath, { zhPath, enPath: path });
      }
    } else {
      // zh-CN version (could also have en version in a separate page)
      const enPath = `en/${path}`;
      const existing = routes.get(path);
      if (existing) {
        existing.enPath = enPath;
      } else {
        routes.set(path, { zhPath: path, enPath: enPath });
      }
    }
  }

  const entries: string[] = [];
  for (const [, { zhPath, enPath }] of routes) {
    const zhUrl = new URL(
      zhPath === "index.html" ? "" : zhPath.replace(/\/index\.html$/, "/"),
      baseUrl,
    ).toString();
    const enUrl = enPath
      ? new URL(enPath.replace(/\/index\.html$/, "/"), baseUrl).toString()
      : null;

    entries.push(`  <url>
    <loc>${escapeXml(zhUrl)}</loc>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="${escapeXml(zhUrl)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(zhUrl)}" />
    ${enUrl ? `<xhtml:link rel="alternate" hreflang="en" href="${escapeXml(enUrl)}" />` : ""}
  </url>`);

    if (enUrl) {
      entries.push(`  <url>
    <loc>${escapeXml(enUrl)}</loc>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="${escapeXml(zhUrl)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(zhUrl)}" />
    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(enUrl)}" />
  </url>`);
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;

  await writeFile(join(distDir, "sitemap.xml"), sitemap, "utf8");
}

async function writeRobotsTxt(siteUrl: string, distDir: string): Promise<void> {
  const baseUrl = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  const content = `User-agent: *
Allow: /
Disallow: /admin/

Sitemap: ${baseUrl}sitemap.xml
`;
  await writeFile(join(distDir, "robots.txt"), content, "utf8");
}

async function writeRssFeed(
  events: StaticSiteModel["embodiedEvents"],
  siteUrl: string,
  generatedAt: string,
  distDir: string,
): Promise<void> {
  const baseUrl = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  const items = [...events]
    .sort((left, right) => Date.parse(right.happenedAt) - Date.parse(left.happenedAt))
    .map((event) => {
      const url = new URL(`events/${event.slug}/`, baseUrl).toString();
      return `    <item>
      <title>${escapeXml(event.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${new Date(event.publishedAt ?? event.happenedAt).toUTCString()}</pubDate>
      <description>${escapeXml(event.factSummary)}</description>
    </item>`;
    })
    .join("\n");
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Agent Pulse · Embodied Data Intelligence</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Evidence-backed changes in embodied-data production.</description>
    <lastBuildDate>${new Date(generatedAt).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  await writeFile(join(distDir, "feed.xml"), rss, "utf8");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePublicHealth(value: string | undefined): PublicSource["healthStatus"] {
  if (value === "healthy" || value === "degraded" || value === "failed" || value === "skipped")
    return value;
  return "unchecked";
}

function parsePublicStringArray(value: string): string[] {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

type PublicPipelineStageSlug = PublicSource["pipelineStages"][number];

const publicPipelineStageSlugs = new Set<PublicPipelineStageSlug>([
  "demand-definition",
  "acquisition-route",
  "multimodal-capture",
  "production-operations",
  "data-engineering-standards",
  "quality-training-feedback",
]);

function parsePublicPipelineStages(value: string): PublicPipelineStageSlug[] {
  return parsePublicStringArray(value).filter((stage): stage is PublicPipelineStageSlug =>
    publicPipelineStageSlugs.has(stage as PublicPipelineStageSlug),
  );
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

async function optimizeStaticAssets(distDir: string): Promise<void> {
  const cssPath = join(distDir, "assets/app.css");
  const scriptPath = join(distDir, "assets/core.js");
  const timelineScriptPath = join(distDir, "assets/timeline.js");
  const [css, script, timelineScript] = await Promise.all([
    readFile(cssPath, "utf8"),
    readFile(scriptPath, "utf8"),
    readFile(timelineScriptPath, "utf8"),
  ]);
  const scriptOptions = {
    loader: "js" as const,
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    legalComments: "none" as const,
    target: "es2022",
  };
  const [optimizedCss, optimizedScript, optimizedTimelineScript] = await Promise.all([
    transform(css, { loader: "css", minify: true, legalComments: "none" }),
    transform(script, scriptOptions),
    transform(timelineScript, scriptOptions),
  ]);
  await Promise.all([
    writeFile(cssPath, optimizedCss.code, "utf8"),
    writeFile(scriptPath, optimizedScript.code, "utf8"),
    writeFile(timelineScriptPath, optimizedTimelineScript.code, "utf8"),
  ]);
}
