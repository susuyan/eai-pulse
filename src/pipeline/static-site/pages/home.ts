import type { StaticSiteModel } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml, formatDate } from "../render.js";
import { evidenceLinks, localize, sectionHeader, statusChip } from "./shared.js";

export function renderEmbodiedHome(model: StaticSiteModel, locale: Locale): string {
  const featured = [...model.embodiedEvents]
    .sort((left, right) => Date.parse(right.happenedAt) - Date.parse(left.happenedAt))
    .slice(0, 6);
  const evidence = featured.flatMap((event) => event.evidence.slice(0, 1));
  const decisions = [
    [
      "assets/",
      localize(locale, "数据资产", "Data assets"),
      `${model.datasets.length + model.standards.length + model.collectionMethods.length}`,
    ],
    ["peers/", localize(locale, "行业同行", "Industry peers"), `${model.peers.length}`],
    ["sources/", localize(locale, "来源地图", "Source map"), `${model.sources.length}`],
    ["scout/", localize(locale, "行动建议", "Action ideas"), `${model.scout.length}`],
  ];

  return `<section class="home-page-hero shell"><div><span class="section-kicker">EMBODIED DATA INTELLIGENCE</span><h1>${escapeHtml(localize(locale, "看清具身数据生产的关键变化", "See the shifts in embodied data production"))}</h1><p>${escapeHtml(localize(locale, "从需求定义、采集路线和多模态设备，到生产运营、数据标准、质量验收与训练反馈。每个判断都回到可点击的原始证据。", "Follow the production chain from demand definition and acquisition through capture, operations, standards, quality acceptance, and training feedback. Every judgment links back to original evidence."))}</p></div></section>
  <section class="section shell">${sectionHeader("01 / MATERIAL SHIFTS", localize(locale, "当期关键变化", "Current material shifts"), localize(locale, "只展示会改变具身数据采集、生产、交付或质量判断的公开事件。", "Only public events that change data acquisition, production, delivery, or quality decisions."))}<div class="card-grid">${featured
    .map(
      (event) =>
        `<article class="event-card"><span class="eyebrow">${escapeHtml(formatDate(event.happenedAt, locale))}</span><h3><a href="__PREFIX__events/${escapeHtml(event.slug)}/">${escapeHtml(event.title)}</a></h3><p>${escapeHtml(event.factSummary)}</p><div class="chip-row">${event.pipelineStages.map((stage) => statusChip(stage, locale)).join("")}</div></article>`,
    )
    .join("")}</div></section>
  <section class="section section-tint"><div class="shell">${sectionHeader("02 / SIX-STAGE PIPELINE", localize(locale, "六段数据生产管线", "Six-stage data pipeline"), localize(locale, "按生产决策顺序组织证据，而不是按通用 AI 主题聚合。", "Evidence is organized by production decisions, not generic AI topics."))}<ol class="pipeline-rail">${model.pipelineStages
    .map(
      (stage) =>
        `<li data-pipeline-stage="${escapeHtml(stage.slug)}"><span class="pipeline-index">${String(stage.order + 1).padStart(2, "0")}</span><h3><a href="__PREFIX__pipeline/#${escapeHtml(stage.slug)}">${escapeHtml(localize(locale, stage.name, stage.nameEn))}</a></h3><p>${escapeHtml(localize(locale, stage.description, stage.descriptionEn))}</p></li>`,
    )
    .join("")}</ol></div></section>
  <section class="section shell">${sectionHeader("03 / EVIDENCE CHAIN", localize(locale, "关键证据链", "Primary evidence chain"), localize(locale, "发布方自述、独立核验和证据冲突会被明确区分。", "Publisher claims, independent verification, and conflicts are explicitly separated."))}${evidenceLinks(evidence, locale)}</section>
  <section class="section section-tint"><div class="shell">${sectionHeader("04 / DECISION VIEWS", localize(locale, "四个决策视图", "Four decision views"))}<div class="gateway-grid">${decisions
    .map(
      ([route, label, count]) =>
        `<a class="gateway-card" href="__PREFIX__${route}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(count)}</span><small>${escapeHtml(localize(locale, "打开决策视图", "Open decision view"))}</small></a>`,
    )
    .join("")}</div></div></section>`;
}
