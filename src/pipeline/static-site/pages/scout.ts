import type { StaticSiteModel } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml } from "../render.js";
import { localize, pageHero } from "./shared.js";

export function renderScoutPage(model: StaticSiteModel, locale: Locale): string {
  return `${pageHero("SCOUT", localize(locale, "行动建议", "Action ideas"), localize(locale, "把已核验的具身数据生产事件转成可验证的小实验；这些是待验证假设，不是公开事实或投资结论。", "Turn verified embodied data production events into small tests. These are hypotheses, not facts or investment conclusions."))}<section class="section shell"><div class="card-grid">${model.scout
    .map(
      (insight) => `<article class="scout-card"><span class="eyebrow">${escapeHtml(insight.kind)}</span><h2>${escapeHtml(insight.title)}</h2><p>${escapeHtml(insight.hypothesis)}</p><dl><div><dt>${escapeHtml(localize(locale, "目标用户", "Target user"))}</dt><dd>${escapeHtml(insight.targetAudience)}</dd></div><div><dt>${escapeHtml(localize(locale, "为什么是现在", "Why now"))}</dt><dd>${escapeHtml(insight.whyNow)}</dd></div><div><dt>${escapeHtml(localize(locale, "首个小实验", "First experiment"))}</dt><dd>${escapeHtml(insight.suggestedAction)}</dd></div><div><dt>${escapeHtml(localize(locale, "失效条件", "Invalidation"))}</dt><dd>${escapeHtml(insight.counterSignals)}</dd></div></dl><ul>${insight.evidence.map((event) => `<li><a href="__PREFIX__events/${escapeHtml(event.slug)}/">${escapeHtml(event.title)}</a></li>`).join("")}</ul></article>`,
    )
    .join("")}</div></section>`;
}
