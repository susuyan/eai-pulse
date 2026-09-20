import type { PublicEmbodiedEvent } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml, formatDate } from "../render.js";
import {
  evidenceLinks,
  localize,
  pageHero,
  relationLinks,
  statusChip,
  stringList,
} from "./shared.js";

export function renderEventPage(event: PublicEmbodiedEvent, locale: Locale): string {
  const profile = event.dataProfile;
  return `${pageHero("PUBLIC EVENT", event.title, event.factSummary)}<article class="event-detail shell"><div class="event-meta"><time datetime="${escapeHtml(event.happenedAt)}">${escapeHtml(formatDate(event.happenedAt, locale))}</time>${statusChip(profile.evidenceStatus, locale)}</div><section><h2>${escapeHtml(localize(locale, "发生了什么", "What happened"))}</h2><p>${escapeHtml(event.summary)}</p></section><section><h2>${escapeHtml(localize(locale, "对数据生产的影响", "Production impact"))}</h2><p>${escapeHtml(profile.deliveryImpact)}</p><h3>${escapeHtml(localize(locale, "管线阶段", "Pipeline stages"))}</h3>${stringList(profile.pipelineStages)}<h3>${escapeHtml(localize(locale, "场景与任务", "Scenarios and tasks"))}</h3>${stringList([...profile.scenarios, ...profile.tasks])}<h3>${escapeHtml(localize(locale, "模态与采集方式", "Modalities and acquisition"))}</h3>${stringList([...profile.modalities, ...profile.acquisitionMethods])}<h3>${escapeHtml(localize(locale, "质量与成本信号", "Quality and cost signals"))}</h3>${stringList([...profile.qualityMetrics, ...profile.costSignals])}</section><section><h2>${escapeHtml(localize(locale, "相关对象", "Related objects"))}</h2><h3>${escapeHtml(localize(locale, "数据集", "Datasets"))}</h3>${relationLinks(event.datasets, "assets/#", locale)}<h3>${escapeHtml(localize(locale, "标准", "Standards"))}</h3>${relationLinks(event.standards, "assets/#", locale)}<h3>${escapeHtml(localize(locale, "采集方法", "Collection methods"))}</h3>${relationLinks(event.collectionMethods, "assets/#", locale)}<h3>${escapeHtml(localize(locale, "同行", "Peers"))}</h3>${relationLinks(event.peers, "peers/#", locale)}</section><section><h2>${escapeHtml(localize(locale, "事实边界与判断", "Facts and interpretation"))}</h2><h3>${escapeHtml(localize(locale, "技术判断", "Technical interpretation"))}</h3><p>${escapeHtml(event.technicalInsight)}</p><h3>${escapeHtml(localize(locale, "业务影响", "Business impact"))}</h3><p>${escapeHtml(event.businessValue)}</p><h3>${escapeHtml(localize(locale, "下一观察点", "Next signal"))}</h3><p>${escapeHtml(event.futureOutlook)}</p></section><section><h2>${escapeHtml(localize(locale, "原始证据", "Original evidence"))}</h2>${evidenceLinks(event.evidence, locale)}</section></article>`;
}
