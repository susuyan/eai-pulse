import type { StaticSiteModel } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml } from "../render.js";
import { localize, pageHero, statusChip, stringList } from "./shared.js";

export function renderAssetsPage(model: StaticSiteModel, locale: Locale): string {
  const datasets = model.datasets
    .map(
      (item) => `<article class="asset-card" id="${escapeHtml(item.slug)}"><header><h2>${escapeHtml(item.name)}</h2>${statusChip(item.evidenceStatus, locale)}</header><p>${escapeHtml(item.publisher)}</p><a href="${escapeHtml(item.canonicalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localize(locale, "官方入口", "Official page"))}</a><h3>${escapeHtml(localize(locale, "采集方式", "Acquisition"))}</h3>${stringList(item.acquisitionMethods)}<h3>${escapeHtml(localize(locale, "已知边界", "Known limitations"))}</h3>${stringList(item.limitations)}</article>`,
    )
    .join("");
  const standards = model.standards
    .map(
      (item) => `<article class="asset-card" id="${escapeHtml(item.slug)}"><header><h2>${escapeHtml(item.name)}</h2>${statusChip(item.evidenceStatus, locale)}</header><p>${escapeHtml(item.organization)} · ${escapeHtml(item.standardType)}</p><a href="${escapeHtml(item.canonicalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localize(locale, "标准原文", "Standard source"))}</a><h3>${escapeHtml(localize(locale, "覆盖领域", "Coverage"))}</h3>${stringList(item.areas)}</article>`,
    )
    .join("");
  const methods = model.collectionMethods
    .map(
      (item) => `<article class="asset-card" id="${escapeHtml(item.slug)}"><header><h2>${escapeHtml(item.name)}</h2>${statusChip(item.evidenceStatus, locale)}</header><p>${escapeHtml(item.methodKind)} · ${escapeHtml(item.maturity)}</p><a href="${escapeHtml(item.canonicalUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localize(locale, "方法依据", "Method evidence"))}</a><h3>${escapeHtml(localize(locale, "质量边界", "Quality boundaries"))}</h3>${stringList(item.qualityBoundaries)}<h3>${escapeHtml(localize(locale, "失败模式", "Failure modes"))}</h3>${stringList(item.failureModes)}</article>`,
    )
    .join("");
  return `${pageHero("DATA ASSETS", localize(locale, "数据资产", "Data assets"), localize(locale, "统一查看 Dataset、Standard 与 Collection Method，并回链公开事件和原始证据。", "Review datasets, standards, and collection methods with links to public events and original evidence."))}<section class="section shell"><h2>${escapeHtml(localize(locale, "数据集", "Datasets"))}</h2><div class="card-grid">${datasets}</div></section><section class="section section-tint"><div class="shell"><h2>${escapeHtml(localize(locale, "标准与格式", "Standards and formats"))}</h2><div class="card-grid">${standards}</div></div></section><section class="section shell"><h2>${escapeHtml(localize(locale, "采集方法", "Collection methods"))}</h2><div class="card-grid">${methods}</div></section>`;
}
