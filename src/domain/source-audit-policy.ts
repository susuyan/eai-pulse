import {
  embodiedPrioritySourceSlugs,
  prioritySourceContracts,
} from "../catalog/embodied-data/priority-sources.js";
import type { SourceRow } from "../db/types.js";
import { sourceRowContractFingerprint } from "./source-contract.js";

export type AuditPolicy = "pending" | "restricted" | "allowed_metadata";

export function sourceAuditPolicy(
  source: SourceRow,
  requested?: AuditPolicy,
): AuditPolicy | undefined {
  if (
    source.maintenance_status === "restricted" ||
    source.map_status === "restricted" ||
    source.acquisition === "social" ||
    requested === "restricted"
  )
    return "restricted";
  if (!embodiedPrioritySourceSlugs.includes(source.slug)) return requested;
  const contract = prioritySourceContracts.find((entry) => entry.slug === source.slug);
  if (contract?.policy.status === "restricted") return "restricted";
  if (
    contract?.status !== "passed" ||
    contract.policy.status !== "allowed_metadata" ||
    requested === "pending"
  )
    return "pending";
  const reviewedAt = Date.parse(contract.policy.reviewedAt ?? "");
  if (
    !Number.isFinite(reviewedAt) ||
    reviewedAt > Date.now() ||
    !contract.policy.reviewer?.trim() ||
    !contract.policy.reason?.trim()
  )
    return "pending";
  try {
    return sourceRowContractFingerprint(source) === contract.contractFingerprint
      ? "allowed_metadata"
      : "pending";
  } catch {
    return "pending";
  }
}
