import type { PublicEventRelation, StaticSiteModel } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml, formatDate } from "../render.js";
import { evidenceLinks, localize, sectionHeader, statusChip, stringList } from "./shared.js";

function trendEventLinks(events: PublicEventRelation[]): string {
  return `<ul class="evolution-event-links">${events.map((event) => `<li><a href="__PREFIX__events/${escapeHtml(encodeURIComponent(event.slug))}/">${escapeHtml(event.title)}</a></li>`).join("")}</ul>`;
}

function phaseHandoff(model: StaticSiteModel, locale: Locale): string {
  const phases = [...model.evolutionPhases].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
  const current = phases.at(-1);
  const previous = phases.at(-2);
  if (!current) return "";
  const latestEvent = model.embodiedEvents
    .filter((event) => current.events.some((relation) => relation.slug === event.slug))
    .sort((left, right) => Date.parse(right.happenedAt) - Date.parse(left.happenedAt))[0];
  const stages = model.pipelineStages.filter(
    (stage) => current.stageImpacts[stage.slug].evidenceState !== "no-public-evidence",
  );
  return `<section class="section shell home-evolution" data-home-evolution data-no-scroll-reveal>${sectionHeader("02 / EVOLUTION HANDOFF", localize(locale, "发展脉络摘要", "Evolution at a glance"))}<div class="phase-handoff">${previous ? `<div class="phase-handoff-previous"><span class="section-kicker">${escapeHtml(localize(locale, "上一阶段与转折", "Previous phase and turning point"))}</span><h3><a href="__PREFIX__timeline/#phase-${escapeHtml(encodeURIComponent(previous.slug))}">${escapeHtml(previous.title)}</a></h3><p>${escapeHtml(previous.turningPoint)}</p></div>` : ""}<div class="phase-handoff-current"><span class="section-kicker">${escapeHtml(localize(locale, "当前策展阶段", "Latest curated phase"))}</span><h3><a href="__PREFIX__timeline/#phase-${escapeHtml(encodeURIComponent(current.slug))}">${escapeHtml(current.title)}</a></h3><p class="evolution-date"><time datetime="${escapeHtml(current.start)}">${escapeHtml(current.start)}</time> — <time datetime="${escapeHtml(current.end)}">${escapeHtml(current.end)}</time> · ${escapeHtml(localize(locale, "含首尾日期", "inclusive dates"))}</p><p>${escapeHtml(current.thesis)}</p><p class="evolution-date">${escapeHtml(localize(locale, "策展截止", "Curated through"))} ${escapeHtml(current.end)}${latestEvent ? ` · ${escapeHtml(localize(locale, "最新事件日期", "Latest Event date"))} <time datetime="${escapeHtml(latestEvent.happenedAt)}">${escapeHtml(formatDate(latestEvent.happenedAt, locale))}</time>` : ""}</p><ul class="trend-stages" aria-label="${escapeHtml(localize(locale, "有公开证据的影响管线", "Stages with public evidence"))}">${stages.map((stage) => `<li class="pipeline-stage--${escapeHtml(stage.slug)}">${escapeHtml(localize(locale, stage.name, stage.nameEn))}</li>`).join("")}</ul></div></div><a class="home-evolution-link" href="__PREFIX__timeline/">${escapeHtml(localize(locale, "查看完整发展脉络与证据", "Explore the full evolution and evidence"))} <span aria-hidden="true">→</span></a></section>`;
}

function dailyTrends(model: StaticSiteModel, locale: Locale): string {
  if (!model.embodiedTrends.length) return "";
  return `<section class="section section-tint home-trends" data-embodied-trends data-no-scroll-reveal aria-labelledby="home-trends-title"><div class="shell"><header class="section-head"><div><span class="section-kicker">03 / DAILY DATA TRENDS</span><h2 id="home-trends-title">${escapeHtml(localize(locale, "今日具身数据趋势", "Today's embodied data trends"))}</h2><p>${escapeHtml(localize(locale, "跨事件的策展判断，按上海日期每日轮换阅读顺序；排序变化不代表新增事实。", "Curated interpretations across Events. Reading order changes daily by Shanghai date; a new order does not imply new facts."))}</p></div></header><p class="trend-order-status" data-trend-status role="status" aria-live="polite" data-daily-label="${escapeHtml(localize(locale, "每日阅读顺序", "Daily reading order"))}">${escapeHtml(localize(locale, "策展目录顺序 · 全部主题可读", "Catalog order · all themes are readable"))}</p><div class="trend-board" data-trend-list>${model.embodiedTrends
    .map(
      (trend, index) =>
        `<article class="embodied-trend" data-embodied-trend="${escapeHtml(trend.slug)}" data-trend-index="${index}" aria-labelledby="trend-${index}-title"><header><ul class="trend-stages" aria-label="${escapeHtml(localize(locale, "关联管线", "Related pipeline stages"))}">${trend.pipelineStages
          .map((slug) => {
            const stage = model.pipelineStages.find((item) => item.slug === slug);
            return `<li class="pipeline-stage--${escapeHtml(slug)}">${escapeHtml(stage ? localize(locale, stage.name, stage.nameEn) : slug)}</li>`;
          })
          .join(
            "",
          )}</ul><h3 id="trend-${index}-title">${escapeHtml(trend.title)}</h3><p class="trend-thesis">${escapeHtml(trend.thesis)}</p></header><div class="trend-why"><h4>${escapeHtml(localize(locale, "为什么是现在", "Why now"))}</h4><p>${escapeHtml(trend.whyNow)}</p></div><div class="trend-evidence"><div><h4>${escapeHtml(localize(locale, "支持事件", "Supporting Events"))}</h4>${trendEventLinks(trend.events)}</div><div><h4>${escapeHtml(localize(locale, "反证与未知", "Counter-evidence and unknowns"))}</h4>${trend.counterEvents.length ? trendEventLinks(trend.counterEvents) : `<p>${escapeHtml(localize(locale, "尚未收录独立反证；不代表趋势判断已获完整验证。", "No separate counter-evidence is recorded. This does not establish full validation."))}</p>`}<h4>${escapeHtml(localize(locale, "下一观察", "Next watch"))}</h4>${stringList(trend.nextWatch)}</div></div></article>`,
    )
    .join("")}</div></div></section>`;
}

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
  ${phaseHandoff(model, locale)}
  ${dailyTrends(model, locale)}
  <section class="section section-tint"><div class="shell">${sectionHeader("04 / SIX-STAGE PIPELINE", localize(locale, "六段数据生产管线", "Six-stage data pipeline"), localize(locale, "按生产决策顺序组织证据，而不是按通用 AI 主题聚合。", "Evidence is organized by production decisions, not generic AI topics."))}<ol class="pipeline-rail">${model.pipelineStages
    .map(
      (stage) =>
        `<li data-pipeline-stage="${escapeHtml(stage.slug)}"><span class="pipeline-index">${String(stage.order + 1).padStart(2, "0")}</span><h3><a href="__PREFIX__pipeline/#${escapeHtml(stage.slug)}">${escapeHtml(localize(locale, stage.name, stage.nameEn))}</a></h3><p>${escapeHtml(localize(locale, stage.description, stage.descriptionEn))}</p></li>`,
    )
    .join("")}</ol></div></section>
  <section class="section shell">${sectionHeader("05 / EVIDENCE CHAIN", localize(locale, "关键证据链", "Primary evidence chain"), localize(locale, "发布方自述、独立核验和证据冲突会被明确区分。", "Publisher claims, independent verification, and conflicts are explicitly separated."))}${evidenceLinks(evidence, locale)}</section>
  <section class="section section-tint"><div class="shell">${sectionHeader("06 / DECISION VIEWS", localize(locale, "四个决策视图", "Four decision views"))}<div class="gateway-grid">${decisions
    .map(
      ([route, label, count]) =>
        `<a class="gateway-card" href="__PREFIX__${route}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(count)}</span><small>${escapeHtml(localize(locale, "打开决策视图", "Open decision view"))}</small></a>`,
    )
    .join("")}</div></div></section>`;
}
