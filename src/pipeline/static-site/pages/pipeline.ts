import type { StaticSiteModel } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml } from "../render.js";
import { localize, pageHero, statusChip } from "./shared.js";

export function renderPipelinePage(model: StaticSiteModel, locale: Locale): string {
  return `${pageHero("SIX-STAGE PIPELINE", localize(locale, "数据生产管线", "Data production pipeline"), localize(locale, "从业务需求到训练反馈，沿六个阶段查看里程碑、证据、反证和下一信号。", "Trace milestones, evidence, counter-evidence, and next signals from business demand to training feedback."))}<section class="section shell"><ol class="pipeline-stage-list">${model.pipelineStages
    .map((stage) => {
      const events = model.embodiedEvents.filter((event) =>
        event.pipelineStages.includes(stage.slug),
      );
      return `<li id="${escapeHtml(stage.slug)}" data-pipeline-stage="${escapeHtml(stage.slug)}"><header><span>${String(stage.order + 1).padStart(2, "0")}</span><div><h2>${escapeHtml(stage.name)}</h2><p>${escapeHtml(stage.description)}</p></div></header><div class="pipeline-event-list">${events
        .map(
          (event) => `<article><h3><a href="__PREFIX__events/${escapeHtml(event.slug)}/">${escapeHtml(event.title)}</a></h3><p>${escapeHtml(event.dataProfile.deliveryImpact)}</p><div class="chip-row">${statusChip(event.dataProfile.evidenceStatus, locale)}</div></article>`,
        )
        .join("")}</div></li>`;
    })
    .join("")}</ol></section>`;
}

export function renderEmbodiedTimeline(model: StaticSiteModel, locale: Locale): string {
  const events = [...model.embodiedEvents].sort(
    (left, right) => Date.parse(right.happenedAt) - Date.parse(left.happenedAt),
  );
  return `${pageHero("EVIDENCE TIMELINE", localize(locale, "关键变化时间线", "Material-shift timeline"), localize(locale, "按发生时间浏览具身数据生产事件；时间线是辅助入口，判断仍以管线阶段和原始证据为准。", "Browse embodied data production events by date. Pipeline stages and original evidence remain the primary decision frame."))}<section class="section shell"><ol class="timeline-list">${events
    .map(
      (event) => `<li><time datetime="${escapeHtml(event.happenedAt)}">${escapeHtml(event.happenedAt.slice(0, 10))}</time><div><h2><a href="__PREFIX__events/${escapeHtml(event.slug)}/">${escapeHtml(event.title)}</a></h2><p>${escapeHtml(event.factSummary)}</p></div></li>`,
    )
    .join("")}</ol></section>`;
}
