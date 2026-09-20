import { z } from "zod";
import { EmbodiedPipelineStageSchema } from "./embodied-data.js";

export const SourceMapStatusSchema = z.enum(["integrated", "pending", "restricted", "substitute"]);
export type SourceMapStatus = z.infer<typeof SourceMapStatusSchema>;

export const SourcePipelineCoverageSchema = z
  .array(EmbodiedPipelineStageSchema)
  .min(1)
  .transform((values) => [...new Set(values)]);
export type SourcePipelineCoverage = z.infer<typeof SourcePipelineCoverageSchema>;
