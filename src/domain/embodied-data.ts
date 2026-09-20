import { z } from "zod";

export const ContentScopeSchema = z.enum(["legacy-ai", "embodied-data"]);
export type ContentScope = z.infer<typeof ContentScopeSchema>;

export const EmbodiedPipelineStageSchema = z.enum([
  "demand-definition",
  "acquisition-route",
  "multimodal-capture",
  "production-operations",
  "data-engineering-standards",
  "quality-training-feedback",
]);
export type EmbodiedPipelineStage = z.infer<typeof EmbodiedPipelineStageSchema>;

export const EmbodimentSchema = z.enum([
  "humanoid",
  "mobile-manipulator",
  "dual-arm",
  "single-arm",
  "dexterous-hand",
  "mobile-robot",
  "quadruped",
  "autonomous-vehicle",
  "wearable-human",
  "other",
]);
export type Embodiment = z.infer<typeof EmbodimentSchema>;

export const EmbodiedTaskSchema = z.enum([
  "manipulation",
  "locomotion",
  "navigation",
  "loco-manipulation",
  "human-robot-interaction",
  "autonomous-driving",
  "inspection",
  "other",
]);
export type EmbodiedTask = z.infer<typeof EmbodiedTaskSchema>;

export const DataModalitySchema = z.enum([
  "rgb",
  "rgbd",
  "depth",
  "point-cloud",
  "force-torque",
  "tactile",
  "joint-state",
  "pose",
  "imu",
  "audio",
  "action",
  "language",
  "other",
]);
export type DataModality = z.infer<typeof DataModalitySchema>;

export const AcquisitionMethodSchema = z.enum([
  "teleoperation",
  "wearable",
  "autonomous",
  "simulation",
  "synthetic",
  "internet-video",
  "manual-demonstration",
  "hybrid",
]);
export type AcquisitionMethod = z.infer<typeof AcquisitionMethodSchema>;

export const EvidenceStatusSchema = z.enum(["claimed", "verified", "conflicting"]);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const EMBODIED_DATA_PROFILE_SCHEMA_VERSION = 1;

export const EvidenceUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  }, "safe_https_evidence_url_required");

export const EventDataProfileSchema = z
  .object({
    pipelineStages: z.array(EmbodiedPipelineStageSchema).min(1),
    scenarios: z.array(z.string().trim().min(2).max(80)).max(12),
    embodiments: z.array(EmbodimentSchema).max(12),
    tasks: z.array(EmbodiedTaskSchema).max(16),
    modalities: z.array(DataModalitySchema).max(20),
    acquisitionMethods: z.array(AcquisitionMethodSchema).max(8),
    dataFormats: z.array(z.string().trim().min(1).max(80)).max(16),
    standards: z.array(z.string().trim().min(2).max(120)).max(16),
    scaleClaims: z
      .array(
        z
          .object({
            metric: z.string().trim().min(2).max(80),
            value: z.number().finite().nonnegative(),
            unit: z.string().trim().min(1).max(40),
            sourceUrl: EvidenceUrlSchema,
          })
          .strict(),
      )
      .max(12),
    qualityMetrics: z.array(z.string().trim().min(2).max(120)).max(16),
    costSignals: z.array(z.string().trim().min(2).max(160)).max(12),
    deliveryImpact: z.string().trim().min(20).max(800),
    evidenceStatus: EvidenceStatusSchema,
  })
  .strict();

export type EventDataProfile = z.infer<typeof EventDataProfileSchema>;

export function parseEventDataProfile(value: unknown): EventDataProfile {
  return EventDataProfileSchema.parse(value);
}
