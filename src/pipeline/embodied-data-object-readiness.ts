import { EvidenceUrlSchema } from "../domain/embodied-data.js";
import {
  ActorDataCapabilitySchema,
  CollectionMethodProfileSchema,
  DatasetProfileSchema,
  StandardProfileSchema,
} from "../domain/embodied-data-objects.js";

export type DomainObjectReadinessBlocker =
  | "invalid_object_schema"
  | "unsafe_evidence_url"
  | "unsourced_numeric_claim"
  | "missing_time_or_version"
  | "missing_relation_evidence"
  | "missing_primary_evidence"
  | "false_independent_verification";

export type DomainObjectReadinessRecord =
  | { kind: "dataset"; profile: unknown }
  | { kind: "standard"; profile: unknown }
  | { kind: "collection-method"; profile: unknown }
  | { kind: "actor-capability"; profile: unknown };

export interface DomainObjectRelation {
  eventId: string;
  role: string;
}

export interface DomainObjectEvidence {
  eventId: string;
  sourceUrl: string;
  sourceTier: number;
  sourceRole: "publisher" | "independent" | string;
  verifiedAt?: string;
}

export interface DomainObjectReadiness {
  status: "ready" | "blocked";
  blockers: DomainObjectReadinessBlocker[];
}

export function evaluateDomainObjectReadiness(
  record: DomainObjectReadinessRecord,
  relations: DomainObjectRelation[],
  evidence: DomainObjectEvidence[],
): DomainObjectReadiness {
  const blockers: DomainObjectReadinessBlocker[] = [];
  const parsed = schemaFor(record.kind).safeParse(record.profile);
  if (!parsed.success) blockers.push("invalid_object_schema");
  if (hasUnsafeEvidenceUrl(record.profile) || evidence.some((item) => !safeUrl(item.sourceUrl))) {
    blockers.push("unsafe_evidence_url");
  }
  if (hasUnsourcedMetric(record.profile)) blockers.push("unsourced_numeric_claim");

  const relationEventIds = new Set(relations.map((relation) => relation.eventId));
  const linkedEvidence = evidence.filter((item) => relationEventIds.has(item.eventId));
  if (relations.length === 0 || linkedEvidence.length === 0) {
    blockers.push("missing_relation_evidence");
  }
  if (!linkedEvidence.some((item) => item.sourceTier === 1 && safeUrl(item.sourceUrl))) {
    blockers.push("missing_primary_evidence");
  }

  const profile = asRecord(record.profile);
  if (
    record.kind !== "actor-capability" &&
    !hasTimeOrVersionBoundary(record.kind, profile, linkedEvidence)
  ) {
    blockers.push("missing_time_or_version");
  }
  if (record.kind === "actor-capability") {
    const independentlyVerified = profile.verificationStatus === "independently-verified";
    const hasIndependentVerification =
      profile.claimant === "independent" &&
      relations.some((relation) => relation.role === "verification") &&
      linkedEvidence.some((item) => item.sourceRole === "independent");
    if (independentlyVerified && !hasIndependentVerification) {
      blockers.push("false_independent_verification");
      if (!relations.some((relation) => relation.role === "verification")) {
        blockers.push("missing_relation_evidence");
      }
    }
  }

  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    blockers: [...new Set(blockers)],
  };
}

function schemaFor(kind: DomainObjectReadinessRecord["kind"]) {
  switch (kind) {
    case "dataset":
      return DatasetProfileSchema;
    case "standard":
      return StandardProfileSchema;
    case "collection-method":
      return CollectionMethodProfileSchema;
    case "actor-capability":
      return ActorDataCapabilitySchema;
  }
}

function hasTimeOrVersionBoundary(
  kind: Exclude<DomainObjectReadinessRecord["kind"], "actor-capability">,
  profile: Record<string, unknown>,
  evidence: DomainObjectEvidence[],
): boolean {
  if (kind === "dataset" && (profile.version || profile.releaseDate)) return true;
  if (kind === "standard" && (profile.version || profile.verifiedAt)) return true;
  return evidence.some((item) => isTimestamp(item.verifiedAt));
}

function hasUnsafeEvidenceUrl(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUnsafeEvidenceUrl);
  const record = asRecord(value);
  return Object.entries(record).some(([key, item]) => {
    if (key.toLowerCase().endsWith("url") && typeof item === "string") return !safeUrl(item);
    return typeof item === "object" && item !== null ? hasUnsafeEvidenceUrl(item) : false;
  });
}

function hasUnsourcedMetric(value: unknown): boolean {
  const record = asRecord(value);
  for (const [key, item] of Object.entries(record)) {
    if (key.toLowerCase().endsWith("claims") && Array.isArray(item)) {
      if (
        item.some((claim) => {
          const claimRecord = asRecord(claim);
          return typeof claimRecord.value === "number" && !safeUrl(claimRecord.sourceUrl);
        })
      ) {
        return true;
      }
    }
    if (typeof item === "object" && item !== null && hasUnsourcedMetric(item)) return true;
  }
  return false;
}

function safeUrl(value: unknown): boolean {
  return EvidenceUrlSchema.safeParse(value).success;
}

function isTimestamp(value: unknown): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
