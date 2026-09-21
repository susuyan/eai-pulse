import { z } from "zod";
import { EmbodiedPipelineStageSchema } from "./embodied-data.js";

const EventSlugSchema = z.string().trim().min(2).max(160);
const EditorialSummarySchema = z.string().trim().min(20).max(800);
const EditorialTitleSchema = z.string().trim().min(3).max(200);

function uniqueEventSlugs(minimum: number, maximum: number) {
  return z
    .array(EventSlugSchema)
    .min(minimum)
    .max(maximum)
    .superRefine((eventSlugs, context) => {
      if (new Set(eventSlugs).size !== eventSlugs.length) {
        context.addIssue({
          code: "custom",
          message: "event_slugs_must_be_unique",
        });
      }
    });
}

export const PhaseStageImpactSchema = z
  .object({
    summary: EditorialSummarySchema,
    eventSlugs: uniqueEventSlugs(0, 24),
    evidenceState: z.enum(["supported", "limited", "no-public-evidence"]),
  })
  .strict()
  .superRefine((impact, context) => {
    const hasEventEvidence = impact.eventSlugs.length > 0;
    if (impact.evidenceState === "no-public-evidence" && hasEventEvidence) {
      context.addIssue({
        code: "custom",
        path: ["eventSlugs"],
        message: "no_public_evidence_requires_no_event_slugs",
      });
    }
    if (impact.evidenceState !== "no-public-evidence" && !hasEventEvidence) {
      context.addIssue({
        code: "custom",
        path: ["eventSlugs"],
        message: "evidence_state_requires_event_slugs",
      });
    }
  });
export type PhaseStageImpact = z.infer<typeof PhaseStageImpactSchema>;

const PhaseStageImpactsSchema = z
  .object({
    "demand-definition": PhaseStageImpactSchema,
    "acquisition-route": PhaseStageImpactSchema,
    "multimodal-capture": PhaseStageImpactSchema,
    "production-operations": PhaseStageImpactSchema,
    "data-engineering-standards": PhaseStageImpactSchema,
    "quality-training-feedback": PhaseStageImpactSchema,
  })
  .strict();

export const EvolutionPhaseSchema = z
  .object({
    slug: z.string().trim().min(2).max(160),
    start: z.string().date(),
    end: z.string().date(),
    title: EditorialTitleSchema,
    thesis: EditorialSummarySchema,
    turningPoint: EditorialSummarySchema,
    eventSlugs: uniqueEventSlugs(1, 48),
    stageImpacts: PhaseStageImpactsSchema,
    counterEventSlugs: uniqueEventSlugs(0, 24),
    nextSignals: z.array(EditorialSummarySchema).min(1).max(20),
  })
  .strict();
export type EvolutionPhase = z.infer<typeof EvolutionPhaseSchema>;

export const EmbodiedTrendSchema = z
  .object({
    slug: z.string().trim().min(2).max(160),
    title: EditorialTitleSchema,
    thesis: EditorialSummarySchema,
    whyNow: EditorialSummarySchema,
    pipelineStages: z.array(EmbodiedPipelineStageSchema).min(1).max(6),
    eventSlugs: uniqueEventSlugs(2, 48),
    counterEventSlugs: uniqueEventSlugs(0, 24),
    nextWatch: z.array(EditorialSummarySchema).min(1).max(20),
  })
  .strict();
export type EmbodiedTrend = z.infer<typeof EmbodiedTrendSchema>;
