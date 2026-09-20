import type { StaticSiteModel } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml } from "../render.js";
import { externalTextLink, localize, pageHero, statusChip } from "./shared.js";

export function renderSourcesPage(model: StaticSiteModel, locale: Locale): string {
  return `${pageHero("SOURCE MAP", localize(locale, "来源地图", "Source map"), localize(locale, "区分国内与海外、官方与独立、采集方式、生命周期和当前健康状态。", "See region, source role, acquisition method, lifecycle, and current health."))}<section class="section shell"><div class="source-grid">${model.sources
    .map(
      (source) =>
        `<article class="source-card"><header><h2>${externalTextLink(source.homepageUrl, source.name)}</h2>${statusChip(source.lifecycle, locale)}</header><dl><div><dt>${escapeHtml(localize(locale, "地域", "Region"))}</dt><dd>${escapeHtml(source.region)}</dd></div><div><dt>${escapeHtml(localize(locale, "角色", "Role"))}</dt><dd>${escapeHtml(source.role)}</dd></div><div><dt>${escapeHtml(localize(locale, "采集", "Acquisition"))}</dt><dd>${escapeHtml(source.acquisition)}</dd></div><div><dt>${escapeHtml(localize(locale, "健康", "Health"))}</dt><dd>${statusChip(source.healthStatus, locale)}</dd></div></dl></article>`,
    )
    .join("")}</div></section>`;
}
