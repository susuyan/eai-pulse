import type { StaticSiteModel } from "../dto.js";
import type { Locale } from "../i18n.js";
import { escapeHtml } from "../render.js";
import { localize, pageHero, statusChip } from "./shared.js";

export function renderPeersPage(model: StaticSiteModel, locale: Locale): string {
  const rows = model.peers
    .flatMap((peer) =>
      peer.capabilities.map(
        (capability) =>
          `<tr><th scope="row"><a href="${escapeHtml(peer.websiteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(peer.name)}</a><small>${escapeHtml(peer.region)}</small></th><td>${escapeHtml(capability.pipelineStages.join(" · "))}</td><td>${escapeHtml(capability.claimText)}</td><td>${statusChip(capability.verificationStatus, locale)}</td><td><a href="${escapeHtml(capability.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localize(locale, "查看证据", "View evidence"))}</a></td></tr>`,
      ),
    )
    .join("");
  return `${pageHero("EVIDENCE-BASED PEERS", localize(locale, "行业同行", "Industry peers"), localize(locale, "横向比较同行覆盖的管线阶段和公开证据状态；不使用无证据综合排名。", "Compare pipeline coverage and public evidence status. No unsupported overall ranking is shown."))}<section class="section shell peer-matrix-wrap"><table class="peer-matrix"><caption>${escapeHtml(localize(locale, "同行能力与证据矩阵", "Peer capability and evidence matrix"))}</caption><thead><tr><th scope="col">${escapeHtml(localize(locale, "同行", "Peer"))}</th><th scope="col">${escapeHtml(localize(locale, "管线阶段", "Pipeline stage"))}</th><th scope="col">${escapeHtml(localize(locale, "公开主张", "Public claim"))}</th><th scope="col">${escapeHtml(localize(locale, "核验状态", "Verification"))}</th><th scope="col">${escapeHtml(localize(locale, "来源", "Source"))}</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}
