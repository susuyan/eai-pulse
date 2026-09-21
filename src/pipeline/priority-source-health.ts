import type { Kysely } from "kysely";
import { z } from "zod";
import { embodiedPrioritySourceSlugs } from "../catalog/embodied-data/priority-sources.js";
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
    lifecycle: z.enum(["draft", "shadow"]),
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
    shadowTransition: z
      .object({
        from: z.literal("draft"),
        to: z.literal("shadow"),
        at: timestamp,
        qualifyingChecks: z.literal(3),
      })
      .strict()
      .nullable()
      .default(null),
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
      generated > Date.now() ||
      report.newlyShadow !== report.results.filter((row) => row.shadowTransition !== null).length ||
      (report.window.status === "complete") !== (report.window.completedSpacedRuns === 3) ||
      (report.completedAt === null) !== (report.window.completedSpacedRuns === 0) ||
      (report.completedAt !== null && Date.parse(report.completedAt) > generated) ||
      report.results.some(
        (row) =>
          ((row.evidenceWindow.eligible || row.shadowTransition !== null) &&
            (row.policy !== "allowed_metadata" ||
              row.status !== "healthy" ||
              row.itemCount === 0 ||
              row.contractFingerprint === null ||
              row.evidenceWindow.qualifyingChecks !== 3 ||
              report.window.status !== "complete")) ||
          (row.shadowTransition !== null &&
            (!row.evidenceWindow.eligible ||
              row.lifecycle !== "shadow" ||
              report.completedAt === null ||
              report.window.status !== "complete" ||
              Date.parse(row.shadowTransition.at) < Date.parse(report.completedAt ?? "") ||
              Date.parse(row.shadowTransition.at) > generated)) ||
          (row.status === "not_checked"
            ? row.startedAt !== null || row.finishedAt !== null
            : row.startedAt === null ||
              row.finishedAt === null ||
              Date.parse(row.startedAt) > Date.parse(row.finishedAt) ||
              Date.parse(row.finishedAt) > generated),
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
  const [sources, checks, eligibility, auditEvidence, transitions] = await Promise.all([
    db.selectFrom("sources").selectAll().where("slug", "in", embodiedPrioritySourceSlugs).execute(),
    db.selectFrom("source_checks").selectAll().orderBy("finished_at", "desc").execute(),
    observationEligibility(db),
    exportPriorityAuditEvidence(db),
    db
      .selectFrom("jobs")
      .selectAll()
      .where("type", "=", "observation_mode")
      .where("status", "=", "succeeded")
      .execute(),
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
  const generatedAt = new Date().toISOString();
  const completedAt = completed[0]?.finishedAt ?? null;
  const results = embodiedPrioritySourceSlugs.map((slug) => {
    const source = sources.find((row) => row.slug === slug);
    if (!source) throw new Error(`Priority source missing: ${slug}`);
    const check = checks.find((row) => row.source_id === source.id);
    const observation = eligibility.find((row) => row.sourceId === source.id);
    const transition =
      completedAt &&
      completedSpacedRuns === 3 &&
      source.lifecycle_status === "shadow" &&
      observation?.eligible &&
      observation.checkIds.length === 3
        ? transitions.find((job) => {
            if (
              job.source_id !== source.id ||
              job.error_count !== 0 ||
              job.error_summary !== null ||
              job.collected_count !== 0 ||
              job.created_count !== 0 ||
              job.skipped_count !== 0 ||
              !job.finished_at ||
              Date.parse(job.started_at) < Date.parse(completedAt) ||
              Date.parse(job.finished_at) < Date.parse(job.started_at) ||
              Date.parse(job.finished_at) > Date.parse(generatedAt)
            )
              return false;
            try {
              const details = JSON.parse(job.details_json);
              if (
                details.from !== "draft" ||
                details.to !== "shadow" ||
                details.action !== "verify" ||
                details.observationEnabled !== true ||
                !Array.isArray(details.checkIds) ||
                details.checkIds.length !== 3 ||
                new Set(details.checkIds).size !== 3
              )
                return false;
              // The observation gate owns the full live contract; never reconstruct a weaker window.
              return (
                observation.checkIds.every((id) => details.checkIds.includes(id)) &&
                checks
                  .filter((row) => observation.checkIds.includes(row.id))
                  .every((row) => Date.parse(row.finished_at) <= Date.parse(job.started_at))
              );
            } catch {
              return false;
            }
          })
        : undefined;
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
      shadowTransition: transition
        ? { from: "draft", to: "shadow", at: transition.finished_at, qualifyingChecks: 3 }
        : null,
      evidenceWindow: {
        requiredChecks: 3,
        minimumSpacingHours: 6,
        qualifyingChecks: observation?.checkIds.length ?? 0,
        eligible: (observation?.eligible ?? false) && completedSpacedRuns === 3,
        observationEnabled: observation?.observationEnabled ?? false,
      },
    };
  });
  return validatePrioritySourceHealthReport({
    schemaVersion: 1,
    generatedAt,
    completedAt,
    freshnessHours: 24,
    total: 12,
    newlyShadow: results.filter((row) => row.shadowTransition !== null).length,
    window: {
      status: completedSpacedRuns === 3 ? "complete" : "incomplete",
      completedSpacedRuns,
      requiredRuns: 3,
      minimumSpacingHours: 6,
    },
    results,
  });
}
