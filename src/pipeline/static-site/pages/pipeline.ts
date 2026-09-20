import type { StaticSiteModel } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml } from "../render.js";
import { evidenceLinks, localize, pageHero, statusChip } from "./shared.js";

export function renderPipelinePage(model: StaticSiteModel, locale: Locale): string {
  const stageFilters = model.pipelineStages
    .map(
      (stage) =>
        `<button type="button" data-pipeline-filter="${escapeHtml(stage.slug)}" aria-pressed="false">${escapeHtml(stage.name)}</button>`,
    )
    .join("");
  return `${pageHero("SIX-STAGE PIPELINE", localize(locale, "数据生产管线", "Data production pipeline"), localize(locale, "从业务需求到训练反馈，沿六个阶段查看里程碑、证据、反证和下一信号。", "Trace milestones, evidence, counter-evidence, and next signals from business demand to training feedback."))}<section class="section shell" data-embodied-pipeline><div class="pipeline-stage-filter" role="group" aria-label="${escapeHtml(localize(locale, "聚焦管线阶段", "Focus pipeline stage"))}"><button type="button" data-pipeline-filter="all" aria-pressed="true">${escapeHtml(localize(locale, "全部阶段", "All stages"))}</button>${stageFilters}</div><ol class="pipeline-stage-list" data-pipeline-rail>${model.pipelineStages
    .map((stage) => {
      const events = model.embodiedEvents.filter((event) =>
        event.pipelineStages.includes(stage.slug),
      );
      return `<li id="${escapeHtml(stage.slug)}" data-pipeline-stage="${escapeHtml(stage.slug)}" class="pipeline-stage pipeline-stage--${escapeHtml(stage.slug)}"><header><span>${String(stage.order + 1).padStart(2, "0")}</span><div><h2 tabindex="-1">${escapeHtml(stage.name)}</h2><p>${escapeHtml(stage.description)}</p></div></header><div class="pipeline-event-list">${
        events
          .map(
            (event) =>
              `<article><h3><a href="__PREFIX__events/${escapeHtml(event.slug)}/">${escapeHtml(event.title)}</a></h3><p>${escapeHtml(event.dataProfile.deliveryImpact)}</p><div class="chip-row">${statusChip(event.dataProfile.evidenceStatus, locale)}</div><details class="pipeline-evidence"><summary>${escapeHtml(localize(locale, "查看证据", "Review evidence"))}</summary>${evidenceLinks(event.evidence, locale)}</details></article>`,
          )
          .join("") ||
        `<p class="empty-state">${escapeHtml(localize(locale, "暂无已公开事件。", "No public events yet."))}</p>`
      }</div></li>`;
    })
    .join("")}</ol></section>`;
}

export function renderEmbodiedTimeline(model: StaticSiteModel, locale: Locale): string {
  const events = [...model.embodiedEvents].sort(
    (left, right) => Date.parse(right.happenedAt) - Date.parse(left.happenedAt),
  );
  return `${pageHero("EVIDENCE TIMELINE", localize(locale, "关键变化时间线", "Material-shift timeline"), localize(locale, "按发生时间浏览具身数据生产事件；时间线是辅助入口，判断仍以管线阶段和原始证据为准。", "Browse embodied data production events by date. Pipeline stages and original evidence remain the primary decision frame."))}<section class="section shell embodied-timeline" data-embodied-timeline><div class="embodied-timeline-controls"><label><span>${escapeHtml(localize(locale, "搜索事件", "Search events"))}</span><input type="search" data-embodied-timeline-search aria-label="${escapeHtml(localize(locale, "搜索事件", "Search events"))}" autocomplete="off"></label><p data-embodied-timeline-count aria-live="polite">${escapeHtml(localize(locale, `${events.length} 个事件`, `${events.length} events`))}</p></div><ol class="timeline-list">${events
    .map(
      (event) =>
        `<li><article data-event="${escapeHtml(event.slug)}" data-search="${escapeHtml(`${event.title} ${event.factSummary}`.toLowerCase())}"><time datetime="${escapeHtml(event.happenedAt)}">${escapeHtml(event.happenedAt.slice(0, 10))}</time><div><h2><a href="__PREFIX__events/${escapeHtml(event.slug)}/">${escapeHtml(event.title)}</a></h2><p>${escapeHtml(event.factSummary)}</p></div></article></li>`,
    )
    .join("")}</ol></section>`;
}
