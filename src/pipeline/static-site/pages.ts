import type { PublicEmbodiedEvent, StaticSiteModel } from "./dto.js";
import type { Locale } from "./i18n.js";
import { t } from "./i18n.js";
import { renderAssetsPage } from "./pages/assets.js";
import { renderEventPage } from "./pages/event.js";
import { renderEmbodiedHome } from "./pages/home.js";
import { renderPeersPage } from "./pages/peers.js";
import { renderEmbodiedTimeline, renderPipelinePage } from "./pages/pipeline.js";
import { renderScoutPage } from "./pages/scout.js";
import { localize, pageHero } from "./pages/shared.js";
import { renderSourcesPage } from "./pages/sources.js";
import type { PageKey } from "./render.js";
import { escapeHtml, pageLayout } from "./render.js";

export interface StaticPage {
  path: string;
  content: string;
}

const LOCALES: Locale[] = ["zh-CN", "en"];

export function renderStaticPages(model: StaticSiteModel): StaticPage[] {
  return LOCALES.flatMap((locale) => renderPagesForLocale(model, locale));
}

export function renderTimeline(model: StaticSiteModel, locale: Locale): string {
  if (model.embodiedEvents) return renderEmbodiedTimeline(model, locale);
  return renderEmbodiedTimeline(
    {
      ...model,
      embodiedEvents: (model.events ?? []).map((event) => ({
        ...event,
        pipelineStages: [],
        dataProfile: {
          pipelineStages: ["demand-definition"],
          scenarios: [],
          embodiments: [],
          tasks: [],
          modalities: [],
          acquisitionMethods: [],
          dataFormats: [],
          standards: [],
          scaleClaims: [],
          qualityMetrics: [],
          costSignals: [],
          deliveryImpact: event.factSummary,
          evidenceStatus: "claimed",
        },
        datasets: [],
        standards: [],
        collectionMethods: [],
        peers: [],
      })) as PublicEmbodiedEvent[],
    },
    locale,
  );
}

function renderPagesForLocale(model: StaticSiteModel, locale: Locale): StaticPage[] {
  const lp = locale === "en" ? "en/" : "";
  const pages: StaticPage[] = [
    renderPage(
      model,
      `${lp}index.html`,
      0,
      "home",
      localize(
        locale,
        "具身数据情报与生产洞察 · Agent Pulse",
        "Embodied Data Intelligence and Production Insight · Agent Pulse",
      ),
      description(locale, "home"),
      renderEmbodiedHome(model, locale),
      locale,
    ),
    renderPage(
      model,
      `${lp}pipeline/index.html`,
      1,
      "pipeline",
      `${localize(locale, "数据管线", "Data Pipeline")} · Agent Pulse`,
      description(locale, "pipeline"),
      renderPipelinePage(model, locale),
      locale,
    ),
    renderPage(
      model,
      `${lp}assets/index.html`,
      1,
      "assets",
      `${localize(locale, "数据资产", "Data Assets")} · Agent Pulse`,
      description(locale, "assets"),
      renderAssetsPage(model, locale),
      locale,
    ),
    renderPage(
      model,
      `${lp}peers/index.html`,
      1,
      "peers",
      `${localize(locale, "行业同行", "Industry Peers")} · Agent Pulse`,
      description(locale, "peers"),
      renderPeersPage(model, locale),
      locale,
    ),
    renderPage(
      model,
      `${lp}sources/index.html`,
      1,
      "sources",
      `${localize(locale, "来源地图", "Source Map")} · Agent Pulse`,
      description(locale, "sources"),
      renderSourcesPage(model, locale),
      locale,
    ),
    renderPage(
      model,
      `${lp}scout/index.html`,
      1,
      "scout",
      `${localize(locale, "行动建议", "Action Ideas")} · Agent Pulse`,
      description(locale, "scout"),
      renderScoutPage(model, locale),
      locale,
    ),
    renderPage(
      model,
      `${lp}timeline/index.html`,
      1,
      "timeline",
      `${localize(locale, "事件时间线", "Event Timeline")} · Agent Pulse`,
      description(locale, "timeline"),
      renderEmbodiedTimeline(model, locale),
      locale,
    ),
    renderPage(
      model,
      `${lp}changelog/index.html`,
      1,
      "changelog",
      `${localize(locale, "产品更新", "Product Updates")} · Agent Pulse`,
      description(locale, "changelog"),
      changelogPage(model, locale),
      locale,
    ),
    renderPage(
      model,
      `${lp}legal/index.html`,
      1,
      "legal",
      `${localize(locale, "版权与纠错", "Legal and Corrections")} · Agent Pulse`,
      description(locale, "legal"),
      legalPage(locale),
      locale,
    ),
    renderPage(
      model,
      `${lp}404.html`,
      0,
      "home",
      `${localize(locale, "页面未找到", "Page Not Found")} · Agent Pulse`,
      description(locale, "not-found"),
      notFoundPage(locale),
      locale,
      { robots: "noindex, follow" },
    ),
  ];

  for (const event of model.embodiedEvents) {
    pages.push(eventPage(model, event, locale, lp));
  }
  return pages;
}

function eventPage(
  model: StaticSiteModel,
  event: PublicEmbodiedEvent,
  locale: Locale,
  localePrefix: string,
): StaticPage {
  const englishLabel = event.slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
  const title = locale === "en" ? `${englishLabel} · Agent Pulse` : `${event.title} · Agent Pulse`;
  const pageDescription =
    locale === "en"
      ? `Evidence and production impact for the embodied-data event identified as ${englishLabel}.`
      : event.factSummary;
  return renderPage(
    model,
    `${localePrefix}events/${event.slug}/index.html`,
    2,
    "timeline",
    title,
    pageDescription,
    renderEventPage(event, locale),
    locale,
    {
      ogType: "article",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: locale === "en" ? englishLabel : event.title,
          description: pageDescription,
          datePublished: event.publishedAt,
          dateModified: model.generatedAt,
          inLanguage: locale,
          mainEntityOfPage: publicUrl(model.siteUrl, `${localePrefix}events/${event.slug}/`),
          articleSection: event.pipelineStages,
          citation: event.evidence.map((item) => item.url),
        },
      ],
    },
  );
}

function renderPage(
  model: StaticSiteModel,
  path: string,
  depth: number,
  active: PageKey,
  title: string,
  pageDescription: string,
  body: string,
  locale: Locale,
  extra: Partial<Pick<import("./render.js").PageChrome, "robots" | "ogType" | "jsonLd">> = {},
): StaticPage {
  const route = path === "index.html" ? "/" : `/${path.replace(/index\.html$/, "")}`;
  const defaultJsonLd = structuredDataForPage(model, path, active, title, pageDescription, locale);
  const { jsonLd = [], ...pageExtra } = extra;
  return {
    path,
    content: pageLayout({
      title,
      description: clip(pageDescription, 155),
      route,
      depth,
      active,
      body,
      locale,
      siteUrl: model.siteUrl,
      github: model.github,
      generatedAt: model.generatedAt,
      ...pageExtra,
      jsonLd: [...defaultJsonLd, ...jsonLd],
    }),
  };
}

function structuredDataForPage(
  model: StaticSiteModel,
  path: string,
  active: PageKey,
  title: string,
  pageDescription: string,
  locale: Locale,
): Record<string, unknown>[] {
  const route = path === "index.html" ? "" : path.replace(/index\.html$/, "");
  const url = publicUrl(model.siteUrl, route);
  if (path === "index.html" || path === "en/index.html") {
    return [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${url}#website`,
        name: "Agent Pulse",
        url,
        description: pageDescription,
        inLanguage: locale,
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Agent Pulse",
        url,
      },
    ];
  }
  if (
    !new Set<PageKey>(["pipeline", "assets", "peers", "sources", "scout", "timeline"]).has(active)
  ) {
    return [];
  }
  const data: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description: pageDescription,
      url,
      inLanguage: locale,
      isPartOf: { "@id": `${publicUrl(model.siteUrl, locale === "en" ? "en/" : "")}#website` },
    },
  ];
  if (active === "assets") {
    data.push(
      ...model.datasets.map((dataset) => ({
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: dataset.name,
        description: dataset.limitations.join(" ") || `${dataset.name} embodied-data dataset`,
        url: dataset.canonicalUrl,
        creator: { "@type": "Organization", name: dataset.publisher },
        datePublished: dataset.releaseDate ?? undefined,
        license: dataset.license?.url,
        distribution: { "@type": "DataDownload", contentUrl: dataset.access.url },
      })),
    );
  }
  return data;
}

function publicUrl(siteUrl: string, route: string): string {
  const base = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  return new URL(route.replace(/^\//, ""), base).toString();
}

function changelogPage(model: StaticSiteModel, locale: Locale): string {
  const releases = model.product.releases
    .map(
      (release) =>
        `<article id="${escapeHtml(release.version.replaceAll(".", "-"))}">${release.status === "unreleased" ? "" : `<span id="v${escapeHtml(release.version.replaceAll(".", "-"))}" hidden></span>`}<span>${escapeHtml(release.status === "unreleased" ? "UNRELEASED" : release.date)}</span><h2>${escapeHtml(release.name)}</h2><p>${escapeHtml(release.summary)}</p><ul>${release.changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}</ul></article>`,
    )
    .join("");
  return `${pageHero("CHANGELOG", localize(locale, "产品更新", "Product updates"), localize(locale, "公开站能力、数据边界和发布状态的版本记录。", "Versioned changes to public capabilities, data boundaries, and release state."))}<section class="section shell changelog-rail">${releases}</section>`;
}

function legalPage(locale: Locale): string {
  return `${pageHero("LEGAL", localize(locale, "版权、证据与纠错", "Copyright, Evidence, and Corrections"), localize(locale, "公开输出只保留引用、事实摘要和必要分析，不转载第三方完整正文。", "Public output contains citations, factual summaries, and necessary analysis, not full third-party articles."))}<section class="section shell legal-grid"><article><h2>${escapeHtml(localize(locale, "证据与引用", "Evidence and attribution"))}</h2><p>${escapeHtml(localize(locale, "每个公开事件回链原始证据；发布方自述、独立核验和冲突状态分开标注。", "Every public event links to original evidence. Claims, independent verification, and conflicts are labeled separately."))}</p></article><article><h2>${escapeHtml(localize(locale, "纠错", "Corrections"))}</h2><p>${escapeHtml(localize(locale, "发现事实、许可或隐私问题时，相关对象会降级或隔离并保留审计记录。", "Facts, licensing, or privacy issues cause the affected object to be degraded or quarantined with an audit record."))}</p></article></section>`;
}

function notFoundPage(locale: Locale): string {
  return `${pageHero("404", localize(locale, "这个旧页面已移除", "This old page has been removed"), localize(locale, "Agent Pulse 已切换到具身数据生产。请从当前决策视图继续查找。", "Agent Pulse now focuses on embodied-data production. Continue from the current decision views."))}<nav class="not-found-links shell"><a href="__PREFIX__">${escapeHtml(t("nav.home", locale))}</a><a href="__PREFIX__pipeline/">${escapeHtml(t("nav.pipeline", locale))}</a><a href="__PREFIX__sources/">${escapeHtml(t("nav.sources", locale))}</a></nav>`;
}

function description(locale: Locale, page: string): string {
  const values: Record<string, [string, string]> = {
    home: [
      "从一手证据追踪具身数据生产全链路的关键变化。",
      "Track the embodied-data production pipeline from primary evidence.",
    ],
    pipeline: [
      "沿六阶段数据管线查看里程碑、边界和下一信号。",
      "Review milestones, boundaries, and next signals across six production stages.",
    ],
    assets: [
      "比较数据集、标准和采集方法的适用边界与公开证据。",
      "Compare datasets, standards, and collection methods with evidence.",
    ],
    peers: [
      "逐项查看同行能力声明、核验状态和证据。",
      "Review peer capability claims, verification states, and evidence.",
    ],
    sources: [
      "查看具身数据来源覆盖、生命周期和健康状态。",
      "Review embodied-data source coverage, lifecycle, and health.",
    ],
    scout: [
      "把已核验事件转成具身数据生产的小实验。",
      "Turn verified events into small embodied-data production experiments.",
    ],
    timeline: [
      "按发生时间浏览具身数据生产事件。",
      "Browse embodied-data production events by date.",
    ],
    changelog: [
      "查看 Agent Pulse 的产品变化与公开边界。",
      "Review Agent Pulse product changes and public boundaries.",
    ],
    legal: [
      "了解证据引用、版权、纠错和隐私边界。",
      "Understand evidence, copyright, corrections, and privacy boundaries.",
    ],
    "not-found": [
      "旧页面已移除，请使用当前决策视图。",
      "The old page was removed. Use the current decision views.",
    ],
  };
  return values[page]?.[locale === "en" ? 1 : 0] ?? "Agent Pulse";
}

function clip(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1).trimEnd()}…`;
}
