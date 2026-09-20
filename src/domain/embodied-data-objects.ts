import { z } from "zod";
import {
  AcquisitionMethodSchema,
  ContentScopeSchema,
  DataModalitySchema,
  EmbodiedPipelineStageSchema,
  EmbodiedTaskSchema,
  EmbodimentSchema,
  EvidenceStatusSchema,
  EvidenceUrlSchema,
} from "./embodied-data.js";

const shortText = z.string().trim().min(1).max(160);
const detailText = z.string().trim().min(3).max(800);
const nullableDate = z.string().date().nullable();
const isoTimestamp = z.string().datetime({ offset: true });

export const EMBODIED_DATA_OBJECT_SCHEMA_VERSION = 1;

export const SourcedMetricClaimSchema = z
  .object({
    metric: z.string().trim().min(2).max(120),
    value: z.number().finite().nonnegative(),
    unit: z.string().trim().min(1).max(60),
    sourceUrl: EvidenceUrlSchema,
  })
  .strict();
export type SourcedMetricClaim = z.infer<typeof SourcedMetricClaimSchema>;

const SourcedResultSchema = z
  .object({
    claim: z.string().trim().min(20).max(800),
    sourceUrl: EvidenceUrlSchema,
  })
  .strict();

export const DatasetProfileSchema = z
  .object({
    name: shortText,
    version: z.string().trim().min(1).max(80).nullable(),
    publisher: shortText,
    releaseDate: nullableDate,
    canonicalUrl: EvidenceUrlSchema,
    pipelineStages: z.array(EmbodiedPipelineStageSchema).min(1).max(6),
    scenarios: z.array(shortText).max(20),
    embodiments: z.array(EmbodimentSchema).max(12),
    tasks: z.array(EmbodiedTaskSchema).max(16),
    modalities: z.array(DataModalitySchema).max(20),
    acquisitionMethods: z.array(AcquisitionMethodSchema).max(8),
    scaleClaims: z.array(SourcedMetricClaimSchema).max(20),
    dataFormats: z.array(shortText).max(20),
    sensorConfiguration: z.array(shortText).max(24),
    synchronization: z.array(shortText).max(16),
    calibration: z.array(shortText).max(16),
    annotations: z.array(shortText).max(20),
    qualityMethods: z.array(shortText).max(20),
    license: z.object({ name: shortText, url: EvidenceUrlSchema }).strict().nullable(),
    access: z
      .object({
        mode: z.enum(["open", "registration", "restricted", "paid"]),
        url: EvidenceUrlSchema,
      })
      .strict(),
    useCases: z.array(shortText).max(20),
    knownResults: z.array(SourcedResultSchema).max(16),
    limitations: z.array(detailText).max(20),
    evidenceStatus: EvidenceStatusSchema,
  })
  .strict();
export type DatasetProfile = z.infer<typeof DatasetProfileSchema>;

export const StandardTypeSchema = z.enum(["formal", "de-facto", "project-format"]);
export const StandardLifecycleSchema = z.enum(["draft", "active", "deprecated", "retired"]);
export const StandardAreaSchema = z.enum([
  "schema",
  "coordinate-system",
  "time-sync",
  "metadata",
  "interface",
  "storage",
  "annotation",
]);

export const StandardProfileSchema = z
  .object({
    name: shortText,
    standardType: StandardTypeSchema,
    organization: shortText,
    version: z.string().trim().min(1).max(80).nullable(),
    lifecycle: StandardLifecycleSchema,
    canonicalUrl: EvidenceUrlSchema,
    pipelineStages: z.array(EmbodiedPipelineStageSchema).min(1).max(6),
    areas: z.array(StandardAreaSchema).min(1).max(7),
    implementations: z.array(shortText).max(20),
    compatibleTools: z.array(shortText).max(24),
    adopters: z.array(shortText).max(24),
    migrationRequirements: z.array(detailText).max(16),
    verifiedAt: isoTimestamp,
    evidenceStatus: EvidenceStatusSchema,
  })
  .strict();
export type StandardProfile = z.infer<typeof StandardProfileSchema>;

export const CollectionMethodMaturitySchema = z.enum([
  "experimental",
  "emerging",
  "operational",
  "mature",
]);

export const CollectionMethodProfileSchema = z
  .object({
    name: shortText,
    methodKind: AcquisitionMethodSchema,
    canonicalUrl: EvidenceUrlSchema,
    pipelineStages: z.array(EmbodiedPipelineStageSchema).min(1).max(6),
    scenarios: z.array(shortText).max(20),
    embodiments: z.array(EmbodimentSchema).max(12),
    tasks: z.array(EmbodiedTaskSchema).max(16),
    requiredEquipment: z.array(shortText).max(24),
    operatorRoles: z.array(shortText).max(16),
    environmentRequirements: z.array(detailText).max(16),
    modalities: z.array(DataModalitySchema).max(20),
    qualityBoundaries: z.array(detailText).max(20),
    throughputClaims: z.array(SourcedMetricClaimSchema).max(16),
    costClaims: z.array(SourcedMetricClaimSchema).max(16),
    deploymentComplexity: z.enum(["low", "medium", "high"]),
    safetyRisks: z.array(detailText).max(20),
    advantages: z.array(detailText).max(20),
    limitations: z.array(detailText).max(20),
    failureModes: z.array(detailText).max(20),
    maturity: CollectionMethodMaturitySchema,
    evidenceStatus: EvidenceStatusSchema,
  })
  .strict();
export type CollectionMethodProfile = z.infer<typeof CollectionMethodProfileSchema>;

export const ActorCapabilityVerificationStatusSchema = z.enum([
  "self-claimed",
  "independently-verified",
  "conflicting",
  "unknown",
]);

export const ActorDataCapabilitySchema = z
  .object({
    capabilityKey: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    pipelineStages: z.array(EmbodiedPipelineStageSchema).min(1).max(6),
    claimText: z.string().trim().min(20).max(1_200),
    claimant: z.enum(["company", "independent"]),
    sourceUrl: EvidenceUrlSchema,
    claimedAt: isoTimestamp,
    verificationStatus: ActorCapabilityVerificationStatusSchema,
    verifiedAt: isoTimestamp.nullable(),
    confidence: z.number().int().min(0).max(100),
    limitations: z.array(detailText).max(16),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ["independently-verified", "conflicting"].includes(value.verificationStatus) &&
      !value.verifiedAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["verifiedAt"],
        message: "verified_at_required",
      });
    }
  });
export type ActorDataCapability = z.infer<typeof ActorDataCapabilitySchema>;

export const PeerCompanyProfileSchema = z
  .object({
    actorId: z.string().trim().min(1).max(100),
    actorSlug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    actorName: shortText,
    contentScope: ContentScopeSchema,
    capabilities: z.array(ActorDataCapabilitySchema).max(100),
  })
  .strict();
export type PeerCompanyProfile = z.infer<typeof PeerCompanyProfileSchema>;

export const DatasetEventRoleSchema = z.enum([
  "release",
  "update",
  "adoption",
  "evaluation",
  "limitation",
]);
export const StandardEventRoleSchema = z.enum([
  "publication",
  "revision",
  "adoption",
  "migration",
  "conflict",
]);
export const CollectionMethodEventRoleSchema = z.enum([
  "demonstration",
  "benchmark",
  "deployment",
  "failure",
  "cost",
]);
export const ActorCapabilityEvidenceRoleSchema = z.enum(["claim", "verification", "contradiction"]);

export type DatasetEventRole = z.infer<typeof DatasetEventRoleSchema>;
export type StandardEventRole = z.infer<typeof StandardEventRoleSchema>;
export type CollectionMethodEventRole = z.infer<typeof CollectionMethodEventRoleSchema>;
export type ActorCapabilityEvidenceRole = z.infer<typeof ActorCapabilityEvidenceRoleSchema>;
