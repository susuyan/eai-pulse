import { z } from "zod";
import type { EvaluationDimension } from "./evaluate.js";
import {
  type EvaluationContext,
  type EvaluationGateMode,
  parseEvaluationInstant,
} from "./evaluation-context.js";
import type { OperationalEvaluationDecision } from "./evaluation-policy.js";

export const SYSTEM_EVALUATION_SCHEMA_VERSION = 2;
export const SYSTEM_EVALUATION_TARGET = 80;

export interface EvaluationResult {
  id: string;
  releaseVersion: string;
  status: string;
  overallScore: number;
  rawWeightedScore: number;
  evidenceCoverage: number;
  dimensions: EvaluationDimension[];
  capabilities: readonly unknown[];
  notes: string;
  startedAt: string;
  finishedAt: string;
}

export interface EvaluationImprovement {
  slug: string;
  name: string;
  score: number;
  status: EvaluationDimension["status"];
  weightedGap: number;
  penalties: string[];
  nextAction: string;
}

export interface SystemEvaluationReportV1 extends EvaluationResult {
  schemaVersion: 1;
  target: number;
  targetReached: boolean;
  policy: "measured-evidence-only";
  improvementPlan: EvaluationImprovement[];
  comparison?: EvaluationComparison | undefined;
}

export interface SystemEvaluationReportV2 extends EvaluationResult {
  schemaVersion: 2;
  evaluationAsOf: string;
  gateMode: EvaluationGateMode;
  target: number;
  targetReached: boolean;
  policy: "measured-evidence-only";
  improvementPlan: EvaluationImprovement[];
  comparison?: EvaluationComparison | undefined;
  operationalDecision?: OperationalEvaluationDecision | undefined;
}

export type SystemEvaluationReport = SystemEvaluationReportV2;

export interface EvaluationComparison {
  passed: boolean;
  contextError: "evaluation_context_mismatch" | null;
  baselineScore: number;
  currentScore: number;
  scoreDelta: number;
  baselineEvidenceCoverage: number;
  currentEvidenceCoverage: number;
  evidenceCoverageDelta: number;
  regressions: string[];
}

export function buildSystemEvaluationReport(
  evaluation: EvaluationResult,
  context: EvaluationContext,
): SystemEvaluationReport {
  const totalWeight = evaluation.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const improvementPlan = evaluation.dimensions
    .map((dimension) => ({
      slug: dimension.slug,
      name: dimension.name,
      score: dimension.score,
      status: dimension.status,
      weightedGap: Math.round(
        (Math.max(0, SYSTEM_EVALUATION_TARGET - dimension.score) * dimension.weight) /
          Math.max(1, totalWeight),
      ),
      penalties: [...dimension.penalties],
      nextAction: dimension.nextAction,
    }))
    .filter((item) => item.weightedGap > 0 || item.status === "insufficient_data")
    .sort(
      (left, right) =>
        right.weightedGap - left.weightedGap ||
        left.score - right.score ||
        left.slug.localeCompare(right.slug),
    );
  return {
    schemaVersion: SYSTEM_EVALUATION_SCHEMA_VERSION,
    ...evaluation,
    evaluationAsOf: context.asOf.toISOString(),
    gateMode: context.gateMode,
    target: SYSTEM_EVALUATION_TARGET,
    targetReached: evaluation.overallScore >= SYSTEM_EVALUATION_TARGET,
    policy: "measured-evidence-only",
    improvementPlan,
  };
}

export function compareSystemEvaluations(
  current: SystemEvaluationReport,
  baseline: SystemEvaluationReport,
): EvaluationComparison {
  if (current.evaluationAsOf !== baseline.evaluationAsOf) {
    return {
      passed: false,
      contextError: "evaluation_context_mismatch",
      baselineScore: baseline.overallScore,
      currentScore: current.overallScore,
      scoreDelta: current.overallScore - baseline.overallScore,
      baselineEvidenceCoverage: baseline.evidenceCoverage,
      currentEvidenceCoverage: current.evidenceCoverage,
      evidenceCoverageDelta: current.evidenceCoverage - baseline.evidenceCoverage,
      regressions: [
        `evaluation context mismatch: baseline ${baseline.evaluationAsOf}, current ${current.evaluationAsOf}`,
      ],
    };
  }
  const regressions: string[] = [];
  if (current.overallScore < baseline.overallScore) {
    regressions.push(
      `overall score regressed from ${baseline.overallScore} to ${current.overallScore}`,
    );
  }
  if (current.rawWeightedScore < baseline.rawWeightedScore) {
    regressions.push(
      `raw weighted score regressed from ${baseline.rawWeightedScore} to ${current.rawWeightedScore}`,
    );
  }
  if (current.evidenceCoverage < baseline.evidenceCoverage) {
    regressions.push(
      `evidence coverage regressed from ${baseline.evidenceCoverage}% to ${current.evidenceCoverage}%`,
    );
  }
  const currentBySlug = new Map(current.dimensions.map((dimension) => [dimension.slug, dimension]));
  for (const previous of baseline.dimensions) {
    const next = currentBySlug.get(previous.slug);
    if (!next) {
      regressions.push(`evaluation dimension removed: ${previous.slug}`);
      continue;
    }
    if (next.score < previous.score) {
      regressions.push(
        `dimension ${previous.slug} regressed from ${previous.score} to ${next.score}`,
      );
    }
  }
  return {
    passed: regressions.length === 0,
    contextError: null,
    baselineScore: baseline.overallScore,
    currentScore: current.overallScore,
    scoreDelta: current.overallScore - baseline.overallScore,
    baselineEvidenceCoverage: baseline.evidenceCoverage,
    currentEvidenceCoverage: current.evidenceCoverage,
    evidenceCoverageDelta: current.evidenceCoverage - baseline.evidenceCoverage,
    regressions,
  };
}

const timestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)), {
  message: "must be a valid timestamp",
});

const evaluationDimensionSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    score: z.number(),
    rawScore: z.number(),
    scoreCap: z.number(),
    weight: z.number(),
    status: z.enum(["measured", "insufficient_data"]),
    sampleSize: z.number(),
    sampleTarget: z.number(),
    summary: z.string(),
    evidence: z.record(z.string(), z.union([z.number(), z.string()])),
    penalties: z.array(z.string()),
    nextAction: z.string(),
  })
  .strict();

const evaluationImprovementSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    score: z.number(),
    status: z.enum(["measured", "insufficient_data"]),
    weightedGap: z.number(),
    penalties: z.array(z.string()),
    nextAction: z.string(),
  })
  .strict();

const evaluationComparisonSchema = z
  .object({
    passed: z.boolean(),
    contextError: z.enum(["evaluation_context_mismatch"]).nullable().optional(),
    baselineScore: z.number(),
    currentScore: z.number(),
    scoreDelta: z.number(),
    baselineEvidenceCoverage: z.number(),
    currentEvidenceCoverage: z.number(),
    evidenceCoverageDelta: z.number(),
    regressions: z.array(z.string()),
  })
  .strict();

const operationalEvaluationDecisionSchema = z
  .object({
    status: z.enum(["ok", "critical"]),
    reasonCodes: z.array(
      z.enum([
        "system_score_below_floor",
        "evaluation_stale",
        "evaluation_persistently_stale",
        "evaluation_report_invalid",
      ]),
    ),
    currentScore: z.number().nullable(),
    persistedEvaluationAsOf: timestampSchema.nullable(),
    ageMinutes: z.number().nonnegative().nullable(),
    refreshEligible: z.boolean(),
    fingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  })
  .strict();

const evaluationReportFields = {
  id: z.string(),
  releaseVersion: z.string(),
  status: z.string(),
  overallScore: z.number(),
  rawWeightedScore: z.number(),
  evidenceCoverage: z.number(),
  dimensions: z.array(evaluationDimensionSchema),
  capabilities: z.array(z.unknown()),
  notes: z.string(),
  startedAt: timestampSchema,
  finishedAt: timestampSchema,
  target: z.number(),
  targetReached: z.boolean(),
  policy: z.literal("measured-evidence-only"),
  improvementPlan: z.array(evaluationImprovementSchema),
  comparison: evaluationComparisonSchema.optional(),
};

const systemEvaluationReportV1Schema = z
  .object({ schemaVersion: z.literal(1), ...evaluationReportFields })
  .strict();

export const systemEvaluationReportV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    ...evaluationReportFields,
    evaluationAsOf: timestampSchema,
    gateMode: z.enum(["change", "operational"]),
    operationalDecision: operationalEvaluationDecisionSchema.optional(),
  })
  .strict();

export function normalizeSystemEvaluationReport(value: unknown): SystemEvaluationReportV2 {
  const version = z.object({ schemaVersion: z.number().int() }).parse(value).schemaVersion;
  if (version === 2) {
    const report = systemEvaluationReportV2Schema.parse(value);
    return {
      ...report,
      evaluationAsOf: parseEvaluationInstant(report.evaluationAsOf, "evaluationAsOf").toISOString(),
      comparison: report.comparison
        ? { ...report.comparison, contextError: report.comparison.contextError ?? null }
        : undefined,
    };
  }
  if (version !== 1) throw new Error(`Unsupported system evaluation schema: ${version}`);
  const legacy = systemEvaluationReportV1Schema.parse(value);
  const evaluationAsOf = parseEvaluationInstant(legacy.finishedAt, "finishedAt").toISOString();
  const normalized = systemEvaluationReportV2Schema.parse({
    ...legacy,
    schemaVersion: 2,
    evaluationAsOf,
    gateMode: "operational",
    comparison: legacy.comparison
      ? { ...legacy.comparison, contextError: legacy.comparison.contextError ?? null }
      : undefined,
  });
  return {
    ...normalized,
    comparison: normalized.comparison
      ? { ...normalized.comparison, contextError: normalized.comparison.contextError ?? null }
      : undefined,
  };
}

export function renderEvaluationSummary(
  report: SystemEvaluationReport,
  comparison: EvaluationComparison | null,
): string {
  const delta = comparison
    ? `${comparison.scoreDelta >= 0 ? "+" : ""}${comparison.scoreDelta}`
    : "n/a";
  const lines = [
    "## System Capability Evaluation",
    "",
    `- Score: ${report.overallScore} / 100 (target ${report.target}, delta ${delta})`,
    `- Raw weighted score: ${report.rawWeightedScore} / 100`,
    `- Evidence coverage: ${report.evidenceCoverage}%`,
    `- Regression gate: ${comparison ? (comparison.passed ? "passed" : "failed") : "baseline unavailable"}`,
    "",
    "### Highest-priority evidence gaps",
    "",
    "| Dimension | Score | Weighted gap | Next action |",
    "| --- | ---: | ---: | --- |",
    ...report.improvementPlan
      .slice(0, 5)
      .map(
        (item) =>
          `| ${summaryCell(item.name)} | ${item.score} | ${item.weightedGap} | ${summaryCell(item.nextAction)} |`,
      ),
  ];
  if (comparison && !comparison.passed) {
    lines.push("", "### Regressions", "", ...comparison.regressions.map((item) => `- ${item}`));
  }
  return `${lines.join("\n")}\n`;
}

function summaryCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
