import type {
  PublicEventRelation,
  PublicEvolutionPhase,
  PublicPhaseStageImpact,
  PublicPipelineStage,
  StaticSiteModel,
} from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml } from "../render.js";
import { localize, pageHero, stringList } from "./shared.js";

const calendar = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });

function evidenceLabel(state: PublicPhaseStageImpact["evidenceState"], locale: Locale): string {
  const labels = {
    supported: ["有公开证据", "Public evidence"],
    limited: ["证据有限", "Limited evidence"],
    "no-public-evidence": ["暂无公开证据", "No public evidence"],
  };
  return escapeHtml(labels[state][locale === "en" ? 1 : 0] ?? state);
}

function eventLinks(events: PublicEventRelation[]): string {
  return `<ul class="evolution-event-links">${events
    .map(
      (event) =>
        `<li><a href="__PREFIX__events/${escapeHtml(encodeURIComponent(event.slug))}/">${escapeHtml(event.title)}</a></li>`,
    )
    .join("")}</ul>`;
}

function phaseRange(phase: PublicEvolutionPhase): string {
  return `<time datetime="${escapeHtml(phase.start)}">${escapeHtml(phase.start)}</time><span aria-hidden="true"> — </span><time datetime="${escapeHtml(phase.end)}">${escapeHtml(phase.end)}</time>`;
}

function stageImpact(
  phase: PublicEvolutionPhase,
  stage: PublicPipelineStage,
  locale: Locale,
): string {
  const impact = phase.stageImpacts[stage.slug];
  return `<section class="evolution-impact pipeline-stage--${escapeHtml(stage.slug)}" data-evolution-stage="${escapeHtml(stage.slug)}"><h3>${escapeHtml(localize(locale, stage.name, stage.nameEn))}</h3><span class="evolution-evidence-state" data-evidence-state="${escapeHtml(impact.evidenceState)}">${evidenceLabel(impact.evidenceState, locale)}</span><p>${escapeHtml(impact.summary)}</p>${eventLinks(impact.events)}</section>`;
}

export function renderEmbodiedEvolutionTimeline(model: StaticSiteModel, locale: Locale): string {
  const phases = [...(model.evolutionPhases ?? [])].sort((a, b) => a.start.localeCompare(b.start));
  const stages = [...(model.pipelineStages ?? [])].sort((a, b) => a.order - b.order);
  const events = [...(model.embodiedEvents ?? [])].sort(
    (a, b) => Date.parse(b.happenedAt) - Date.parse(a.happenedAt),
  );
  const current = phases.at(-1);
  const previous = phases.at(-2);
  const latestEvent = events.find((event) =>
    current?.events.some((item) => item.slug === event.slug),
  );
  const summary = current
    ? `<section class="evolution-summary" data-evolution-summary aria-labelledby="evolution-current"><div><span class="section-kicker">${escapeHtml(localize(locale, "当前策展阶段", "Latest curated phase"))}</span><h2 id="evolution-current"><a href="#phase-${escapeHtml(current.slug)}">${escapeHtml(current.title)}</a></h2><p>${escapeHtml(current.thesis)}</p><p class="evolution-date">${escapeHtml(localize(locale, "策展截止", "Curated through"))} <time datetime="${escapeHtml(current.end)}">${escapeHtml(current.end)}</time>${latestEvent ? ` · ${escapeHtml(localize(locale, "最新事件日期", "Latest Event date"))} <time datetime="${escapeHtml(latestEvent.happenedAt)}">${escapeHtml(calendar.format(new Date(latestEvent.happenedAt)))}</time>` : ""}</p><ul class="evolution-impact-summary">${stages.map((stage) => `<li data-evolution-impact-summary="${escapeHtml(stage.slug)}"><span>${escapeHtml(localize(locale, stage.name, stage.nameEn))}</span><small>${evidenceLabel(current.stageImpacts[stage.slug].evidenceState, locale)}</small></li>`).join("")}</ul></div>${previous ? `<div class="evolution-previous"><h3>${escapeHtml(localize(locale, "上一阶段的转折", "Previous turning point"))}</h3><a href="#phase-${escapeHtml(previous.slug)}">${escapeHtml(previous.title)}</a><p>${escapeHtml(previous.turningPoint)}</p></div>` : ""}</section>`
    : "";

  return `${pageHero("EMBODIED DATA EVOLUTION", localize(locale, "具身数据发展脉络", "Embodied Data Evolution"), localize(locale, "沿时间阶段与六段生产管线，追踪具身数据如何演进。阶段判断回链公开事件，证据空白与下一信号一并保留。", "Trace embodied data through time and six production stages. Curated interpretations link to public Events, with evidence gaps and next signals kept visible."))}<div class="section shell evolution-timeline" data-embodied-evolution>${phases.length ? `<nav class="evolution-phase-nav" aria-label="${escapeHtml(localize(locale, "发展阶段导航", "Evolution phases"))}"><ol>${phases.map((phase, index) => `<li><a href="#phase-${escapeHtml(phase.slug)}" data-evolution-phase-link="${escapeHtml(phase.slug)}"><span class="evolution-sequence">${String(index + 1).padStart(2, "0")} <span>${escapeHtml(phase.start.slice(0, 4))}–${escapeHtml(phase.end.slice(0, 4))}</span></span><strong>${escapeHtml(phase.title)}</strong></a></li>`).join("")}</ol></nav>` : ""}${summary}<div class="evolution-filters" data-evolution-filters hidden role="group" aria-label="${escapeHtml(localize(locale, "聚焦管线阶段", "Focus pipeline stage"))}"><button type="button" data-evolution-stage-filter="all" aria-pressed="true">${escapeHtml(localize(locale, "全部管线", "All stages"))}</button>${stages.map((stage) => `<button type="button" data-evolution-stage-filter="${escapeHtml(stage.slug)}" aria-pressed="false">${escapeHtml(localize(locale, stage.name, stage.nameEn))}</button>`).join("")}</div><ol class="evolution-spine">${phases
    .map(
      (phase, index) =>
        `<li class="evolution-phase" id="phase-${escapeHtml(phase.slug)}" data-evolution-phase="${escapeHtml(phase.slug)}"><header class="evolution-phase-heading"><span class="evolution-sequence" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><div><p class="evolution-date">${phaseRange(phase)}</p><h2>${escapeHtml(phase.title)}</h2><p class="evolution-thesis">${escapeHtml(phase.thesis)}</p></div></header><div class="evolution-phase-body"><p class="evolution-turning"><strong>${escapeHtml(localize(locale, "关键转折", "Turning point"))}</strong>${escapeHtml(phase.turningPoint)}</p><div class="evolution-stage-grid">${stages.map((stage) => stageImpact(phase, stage, locale)).join("")}</div><div class="evolution-evidence-ledger"><section><h3>${escapeHtml(localize(locale, "关键事件", "Key Events"))}</h3>${eventLinks(phase.events)}</section><section><h3>${escapeHtml(localize(locale, "反证与未知", "Counter-evidence and unknowns"))}</h3>${phase.counterEvents.length ? eventLinks(phase.counterEvents) : `<p>${escapeHtml(localize(locale, "尚未收录独立反证；不代表阶段判断已获完整验证。", "No separate counter-evidence is recorded. This does not establish full validation."))}</p>`}</section><section><h3>${escapeHtml(localize(locale, "下一信号", "Next signals"))}</h3>${stringList(phase.nextSignals)}</section></div></div></li>`,
    )
    .join(
      "",
    )}</ol><section class="evolution-event-index" data-evolution-event-index aria-labelledby="evolution-events"><header><h2 id="evolution-events">${escapeHtml(localize(locale, "全部事件索引", "Complete Event index"))}</h2><p>${escapeHtml(localize(locale, `${events.length} 个事件 · 按发生时间倒序 · 不受管线筛选影响`, `${events.length} Events · newest first · always visible when filtering`))}</p></header><ol class="timeline-list">${events
    .map(
      (event) =>
        `<li><article data-event="${escapeHtml(event.slug)}" data-evolution-event="${escapeHtml(event.slug)}"><time datetime="${escapeHtml(event.happenedAt)}">${escapeHtml(calendar.format(new Date(event.happenedAt)))}</time><div><h3><a href="__PREFIX__events/${escapeHtml(encodeURIComponent(event.slug))}/">${escapeHtml(event.title)}</a></h3><p>${escapeHtml(event.factSummary)}</p></div></article></li>`,
    )
    .join("")}</ol></section></div>`;
}
