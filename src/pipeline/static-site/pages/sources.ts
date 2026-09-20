import type { StaticSiteModel } from "../dto.js";
import type { Locale } from "../i18n.js";
import { summarizeSourceCoverageGaps } from "../intelligence.js";
import { escapeHtml } from "../render.js";
import { externalTextLink, localize, pageHero, statusChip } from "./shared.js";

export function renderSourcesPage(model: StaticSiteModel, locale: Locale): string {
  const regions = [...new Set(model.sources.map((source) => source.region).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
  const gaps = summarizeSourceCoverageGaps(model.sources, model.pipelineStages);
  const stageBySlug = new Map(model.pipelineStages.map((stage) => [stage.slug, stage]));
  const mapFilters: Array<[string, string, string]> = [
    ["integrated", "已接入", "Integrated"],
    ["pending", "待接入", "Pending"],
    ["restricted", "受限", "Restricted"],
    ["substitute", "替代来源", "Substitute"],
  ];
  const filters = `<div class="pipeline-stage-filter" role="group" aria-label="${escapeHtml(localize(locale, "筛选来源地图", "Filter source map"))}"><span>${escapeHtml(localize(locale, "地域", "Region"))}</span><button type="button" data-source-filter-region="all" aria-pressed="true">${escapeHtml(localize(locale, "全部", "All"))}</button>${regions
    .map(
      (region) =>
        `<button type="button" data-source-filter-region="${escapeHtml(region)}" aria-pressed="false">${escapeHtml(region)}</button>`,
    )
    .join(
      "",
    )}<span>${escapeHtml(localize(locale, "阶段", "Stage"))}</span><button type="button" data-source-filter-stage="all" aria-pressed="true">${escapeHtml(localize(locale, "全部", "All"))}</button>${model.pipelineStages
    .map(
      (stage) =>
        `<button type="button" data-source-filter-stage="${escapeHtml(stage.slug)}" aria-pressed="false">${escapeHtml(localize(locale, stage.name, stage.nameEn))}</button>`,
    )
    .join(
      "",
    )}<span>${escapeHtml(localize(locale, "接入状态", "Map state"))}</span><button type="button" data-source-filter-map="all" aria-pressed="true">${escapeHtml(localize(locale, "全部", "All"))}</button>${mapFilters
    .map(
      ([status, zh, en]) =>
        `<button type="button" data-source-filter-map="${status}" aria-pressed="false">${escapeHtml(localize(locale, zh, en))}</button>`,
    )
    .join("")}</div>`;
  const gapSummary = gaps.length
    ? `<ul class="compact-list">${gaps
        .map((gap) => {
          const stage = stageBySlug.get(gap.stage);
          const stageName = stage ? localize(locale, stage.name, stage.nameEn) : gap.stage;
          return `<li>${escapeHtml(`${stageName} · ${gap.category}`)}</li>`;
        })
        .join("")}</ul>`
    : `<p class="empty-state">${escapeHtml(localize(locale, "当前六阶段分类矩阵无覆盖缺口。", "No coverage gaps in the current six-stage category matrix."))}</p>`;

  return `${pageHero("SOURCE MAP", localize(locale, "来源地图", "Source map"), localize(locale, "区分国内与海外、官方与独立、采集方式、生命周期和当前健康状态。", "See region, source role, acquisition method, lifecycle, and current health."))}<section class="section shell" data-source-map>${filters}<section aria-labelledby="source-coverage-gaps"><h2 id="source-coverage-gaps">${escapeHtml(localize(locale, "覆盖缺口", "Coverage gaps"))}</h2>${gapSummary}</section><div class="source-grid" data-source-grid>${model.sources
    .map(
      (source) =>
        `<article class="source-card" data-source-region="${escapeHtml(source.region)}" data-source-stages="${escapeHtml(source.pipelineStages.join(" "))}" data-source-map-status="${escapeHtml(source.mapStatus)}"><header><h2>${externalTextLink(source.homepageUrl, source.name)}</h2>${statusChip(source.mapStatus, locale)}</header><dl><div><dt>${escapeHtml(localize(locale, "地域", "Region"))}</dt><dd>${escapeHtml(source.region)}</dd></div><div><dt>${escapeHtml(localize(locale, "角色", "Role"))}</dt><dd>${escapeHtml(source.role)}</dd></div><div><dt>${escapeHtml(localize(locale, "采集", "Acquisition"))}</dt><dd>${escapeHtml(source.acquisition)}</dd></div><div><dt>${escapeHtml(localize(locale, "生命周期", "Lifecycle"))}</dt><dd>${statusChip(source.lifecycle, locale)}</dd></div><div><dt>${escapeHtml(localize(locale, "健康", "Health"))}</dt><dd>${statusChip(source.healthStatus, locale)}</dd></div>${source.substituteFor.length ? `<div><dt>${escapeHtml(localize(locale, "替代对象", "Substitutes"))}</dt><dd>${escapeHtml(source.substituteFor.join(", "))}</dd></div>` : ""}${source.restrictionNote ? `<div><dt>${escapeHtml(localize(locale, "限制说明", "Restriction"))}</dt><dd>${escapeHtml(source.restrictionNote)}</dd></div>` : ""}</dl></article>`,
    )
    .join("")}</div></section>`;
}
