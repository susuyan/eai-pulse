import type { Kysely } from "kysely";
import { z } from "zod";
import { embodiedPrioritySourceSlugs } from "../catalog/embodied-data/priority-sources.js";
import { embodiedSourceCatalog } from "../catalog/embodied-data/sources.js";
import type { DatabaseSchema } from "../db/types.js";
import { sourceAuditPolicy } from "../domain/source-audit-policy.js";
import { observationEligibility } from "./observation.js";
import { exportPriorityAuditEvidence } from "./priority-audit-evidence.js";

export const PRIORITY_REPORT_PATH = "data/reports/embodied-priority-source-health.json";
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const resultSchema = z
  .object({
    slug: z.enum(embodiedPrioritySourceSlugs as [string, ...string[]]),
    lifecycle: z.enum(["draft", "shadow", "active", "degraded", "quarantined", "retired"]),
    policy: z.enum(["pending", "restricted", "allowed_metadata"]),
    status: z.enum(["not_checked", "healthy", "degraded", "failed", "skipped"]),
    itemCount: count,
    adapterVersion: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/),
    contractFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    startedAt: timestamp.nullable(),
    finishedAt: timestamp.nullable(),
    evidenceWindow: z
      .object({
        requiredChecks: z.literal(3),
        minimumSpacingHours: z.literal(6),
        qualifyingChecks: count.max(3),
        eligible: z.boolean(),
        observationEnabled: z.boolean(),
      })
      .strict(),
  })
  .strict();
const reportSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: timestamp,
    completedAt: timestamp.nullable(),
    freshnessHours: z.literal(24),
    total: z.literal(12),
    newlyShadow: count.max(12),
    window: z
      .object({
        status: z.enum(["incomplete", "complete"]),
        completedSpacedRuns: count.max(3),
        requiredRuns: z.literal(3),
        minimumSpacingHours: z.literal(6),
      })
      .strict(),
    results: z.array(resultSchema).length(12),
  })
  .strict()
  .superRefine((report, context) => {
    const slugs = report.results.map((row) => row.slug);
    if (
      new Set(slugs).size !== 12 ||
      embodiedPrioritySourceSlugs.some((slug) => !slugs.includes(slug))
    )
      context.addIssue({
        code: "custom",
        message: "Priority report must contain the exact cohort",
      });
    const generated = Date.parse(report.generatedAt);
    if (
      (report.window.status === "complete") !== (report.window.completedSpacedRuns === 3) ||
      (report.completedAt === null) !== (report.window.completedSpacedRuns === 0) ||
      (report.completedAt !== null && Date.parse(report.completedAt) > generated) ||
      report.results.some((row) =>
        row.status === "not_checked"
          ? row.startedAt !== null || row.finishedAt !== null
          : row.startedAt === null ||
            row.finishedAt === null ||
            Date.parse(row.startedAt) > Date.parse(row.finishedAt) ||
            Date.parse(row.finishedAt) > generated,
      )
    )
      context.addIssue({ code: "custom", message: "Inconsistent priority report evidence" });
  });

export function validatePrioritySourceHealthReport(value: unknown) {
  return reportSchema.parse(value);
}

export function priorityReportFreshness(
  value: unknown,
  now = new Date(),
): "fresh" | "stale" | "invalid" {
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success || !parsed.data.completedAt) return "invalid";
  const finished = Date.parse(parsed.data.completedAt);
  const generated = Date.parse(parsed.data.generatedAt);
  if (
    !Number.isFinite(now.getTime()) ||
    finished > now.getTime() ||
    generated > now.getTime() ||
    generated < finished
  )
    return "invalid";
  return now.getTime() - finished > 24 * 3_600_000 ? "stale" : "fresh";
}

export async function buildPrioritySourceHealthReport(db: Kysely<DatabaseSchema>) {
  const [sources, checks, eligibility, auditEvidence] = await Promise.all([
    db.selectFrom("sources").selectAll().where("slug", "in", embodiedPrioritySourceSlugs).execute(),
    db.selectFrom("source_checks").selectAll().orderBy("finished_at", "desc").execute(),
    observationEligibility(db),
    exportPriorityAuditEvidence(db),
  ]);
  const completed = auditEvidence.records
    .filter(
      (record) =>
        record.auditComplete &&
        !record.incomplete &&
        record.finishedAt &&
        record.targetSlugs.length === 12 &&
        record.targetSlugs.every((slug) => embodiedPrioritySourceSlugs.includes(slug)),
    )
    .sort((a, b) => Date.parse(b.finishedAt ?? "") - Date.parse(a.finishedAt ?? ""));
  let completedSpacedRuns = 0;
  let newerStart: number | undefined;
  for (const record of completed) {
    if (
      newerStart !== undefined &&
      newerStart - Date.parse(record.finishedAt ?? "") < 6 * 3_600_000
    )
      continue;
    completedSpacedRuns++;
    newerStart = Date.parse(record.startedAt);
    if (completedSpacedRuns === 3) break;
  }
  // Compare persisted state to the fixture-validated catalog baseline, including its existing shadow.
  const newlyShadow = sources.filter(
    (source) =>
      source.lifecycle_status === "shadow" &&
      embodiedSourceCatalog.find((entry) => entry.slug === source.slug)?.lifecycleStatus ===
        "draft",
  ).length;
  const results = embodiedPrioritySourceSlugs.map((slug) => {
    const source = sources.find((row) => row.slug === slug);
    if (!source) throw new Error(`Priority source missing: ${slug}`);
    const check = checks.find((row) => row.source_id === source.id);
    const observation = eligibility.find((row) => row.sourceId === source.id);
    return {
      slug,
      lifecycle: source.lifecycle_status,
      policy: sourceAuditPolicy(source) ?? "pending",
      status: check?.status ?? "not_checked",
      itemCount: check?.item_count ?? 0,
      adapterVersion: source.adapter_version,
      contractFingerprint: check?.contract_fingerprint ?? null,
      startedAt: check?.started_at ?? null,
      finishedAt: check?.finished_at ?? null,
      evidenceWindow: {
        requiredChecks: 3,
        minimumSpacingHours: 6,
        qualifyingChecks: observation?.checkIds.length ?? 0,
        eligible: observation?.eligible ?? false,
        observationEnabled: observation?.observationEnabled ?? false,
      },
    };
  });
  return validatePrioritySourceHealthReport({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    completedAt: completed[0]?.finishedAt ?? null,
    freshnessHours: 24,
    total: 12,
    newlyShadow,
    window: {
      status: completedSpacedRuns === 3 ? "complete" : "incomplete",
      completedSpacedRuns,
      requiredRuns: 3,
      minimumSpacingHours: 6,
    },
    results,
  });
}
