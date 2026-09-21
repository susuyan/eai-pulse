import type { StaticSiteModel } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml } from "../render.js";
import { evidenceLinks, externalTextLink, localize, pageHero, statusChip } from "./shared.js";

export function renderPipelinePage(model: StaticSiteModel, locale: Locale): string {
  const stageFilters = model.pipelineStages
    .map(
      (stage) =>
        `<button type="button" data-pipeline-filter="${escapeHtml(stage.slug)}" aria-pressed="false">${escapeHtml(localize(locale, stage.name, stage.nameEn))}</button>`,
    )
    .join("");
  return `${pageHero("SIX-STAGE PIPELINE", localize(locale, "数据生产管线", "Data production pipeline"), localize(locale, "从业务需求到训练反馈，沿六个阶段查看里程碑、证据、反证和下一信号。", "Trace milestones, evidence, counter-evidence, and next signals from business demand to training feedback."))}<section class="section shell" data-embodied-pipeline><div class="pipeline-stage-filter" role="group" aria-label="${escapeHtml(localize(locale, "聚焦管线阶段", "Focus pipeline stage"))}"><button type="button" data-pipeline-filter="all" aria-pressed="true">${escapeHtml(localize(locale, "全部阶段", "All stages"))}</button>${stageFilters}</div><ol class="pipeline-stage-list" data-pipeline-rail>${model.pipelineStages
    .map((stage) => {
      const milestones = stage.milestones ?? [];
      const peers = stage.peerComparisons ?? [];
      const counterEvidence = stage.counterEvidence ?? [];
      const nextSignals = stage.nextSignals ?? [];
      const empty = `<p class="empty-state">${escapeHtml(localize(locale, "暂无公开记录。", "No public records yet."))}</p>`;
      return `<li id="${escapeHtml(stage.slug)}" data-pipeline-stage="${escapeHtml(stage.slug)}" class="pipeline-stage pipeline-stage--${escapeHtml(stage.slug)}"><header><span>${String(stage.order + 1).padStart(2, "0")}</span><div><h2 tabindex="-1">${escapeHtml(localize(locale, stage.name, stage.nameEn))}</h2><p>${escapeHtml(localize(locale, stage.description, stage.descriptionEn))}</p></div></header><div class="pipeline-stage-analysis"><section><h3>${escapeHtml(localize(locale, "阶段里程碑", "Stage milestones"))}</h3><div class="pipeline-event-list">${
        milestones
          .map(
            (milestone) =>
              `<article><h4><a href="__PREFIX__events/${escapeHtml(milestone.eventSlug)}/">${escapeHtml(milestone.title)}</a></h4><p>${escapeHtml(milestone.deliveryImpact)}</p><div class="chip-row">${statusChip(milestone.evidenceStatus, locale)}</div><details class="pipeline-evidence"><summary>${escapeHtml(localize(locale, "查看证据", "Review evidence"))}</summary>${evidenceLinks(milestone.evidence, locale)}</details></article>`,
          )
          .join("") || empty
      }</div></section><section><h3>${escapeHtml(localize(locale, "同行对比", "Peer comparisons"))}</h3><ul class="pipeline-comparison-list">${
        peers
          .map(
            (peer) =>
              `<li><strong><a href="__PREFIX__peers/#${escapeHtml(peer.peerSlug)}">${escapeHtml(peer.peerName)}</a></strong><p>${escapeHtml(peer.claimText)}</p>${statusChip(peer.verificationStatus, locale)}${externalTextLink(peer.sourceUrl, localize(locale, "原始证据", "Original evidence"))}</li>`,
          )
          .join("") || `<li>${empty}</li>`
      }</ul></section><section><h3>${escapeHtml(localize(locale, "反证与未知", "Counter-evidence and unknowns"))}</h3><ul class="pipeline-counter-list">${
        counterEvidence
          .map(
            (item) =>
              `<li><a href="__PREFIX__events/${escapeHtml(item.eventSlug)}/">${escapeHtml(item.title)}</a>${statusChip(item.evidenceStatus, locale)}</li>`,
          )
          .join("") || `<li>${empty}</li>`
      }</ul></section><section><h3>${escapeHtml(localize(locale, "下一信号", "Next signals"))}</h3><ul class="pipeline-next-list">${
        nextSignals
          .map(
            (item) =>
              `<li><a href="__PREFIX__events/${escapeHtml(item.eventSlug)}/">${escapeHtml(item.eventTitle)}</a><p>${escapeHtml(item.signal)}</p></li>`,
          )
          .join("") || `<li>${empty}</li>`
      }</ul></section></div></li>`;
    })
    .join("")}</ol></section>`;
}
