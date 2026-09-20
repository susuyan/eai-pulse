import type { PublicEvidence } from "../../../domain/types.js";
import type { PublicEventRelation } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml, formatDate, safeExternalLink } from "../render.js";

export function localize(locale: Locale, zh: string, en: string): string {
  return locale === "en" ? en : zh;
}

export function pageHero(kicker: string, title: string, description: string): string {
  return `<section class="page-hero shell"><span class="section-kicker">${escapeHtml(kicker)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></section>`;
}

export function sectionHeader(kicker: string, title: string, description = ""): string {
  return `<header class="section-head"><div><span class="section-kicker">${escapeHtml(kicker)}</span><h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div></header>`;
}

export function statusChip(status: string, locale: Locale): string {
  const labels: Record<string, [string, string]> = {
    verified: ["已核验", "Verified"],
    claimed: ["发布方自述", "Publisher claim"],
    "self-claimed": ["企业自述", "Company claim"],
    "independently-verified": ["独立核验", "Independently verified"],
    conflicting: ["证据冲突", "Conflicting evidence"],
    unknown: ["状态未知", "Unknown"],
    shadow: ["影子观察", "Shadow"],
    active: ["已启用", "Active"],
    degraded: ["已降级", "Degraded"],
    quarantined: ["已隔离", "Quarantined"],
  };
  const label = labels[status]?.[locale === "en" ? 1 : 0] ?? status;
  return `<span class="status-chip" data-status="${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

export function evidenceLinks(evidence: PublicEvidence[], locale: Locale): string {
  if (!evidence.length) {
    return `<p class="empty-state">${escapeHtml(localize(locale, "暂无公开证据。", "No public evidence."))}</p>`;
  }
  return `<ul class="evidence-list">${evidence
    .map((item) => {
      const href = safeExternalLink(item.url);
      const label = `${item.source} · ${formatDate(item.publishedAt, locale)}`;
      return `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(label)}</span>${
        href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localize(locale, "打开原始证据", "Open original evidence"))}</a>`
          : ""
      }</li>`;
    })
    .join("")}</ul>`;
}

export function externalTextLink(value: string, label: string): string {
  const href = safeExternalLink(value);
  return href
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    : `<span>${escapeHtml(label)}</span>`;
}

export function relationLinks(
  relations: PublicEventRelation[],
  baseRoute: string,
  locale: Locale,
): string {
  if (!relations.length) return `<span>${escapeHtml(localize(locale, "暂无", "None"))}</span>`;
  return `<ul class="relation-list">${relations
    .map((relation) => {
      const suffix = baseRoute.endsWith("#") ? "" : "/";
      return `<li><a href="__PREFIX__${escapeHtml(baseRoute)}${escapeHtml(relation.slug)}${suffix}">${escapeHtml(relation.title)}</a> ${statusChip(relation.role, locale)}</li>`;
    })
    .join("")}</ul>`;
}

export function stringList(items: readonly string[]): string {
  return items.length
    ? `<ul class="compact-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "—";
}
