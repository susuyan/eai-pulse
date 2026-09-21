import type { Kysely } from "kysely";
import { z } from "zod";
import { embodiedPrioritySourceSlugs } from "../catalog/embodied-data/priority-sources.js";
import { legacySourceCatalog, sourceCatalog } from "../catalog/sources.js";
import type { DatabaseSchema, NewSourceCheckRow } from "../db/types.js";
import { sha256 } from "../domain/url.js";

const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const slug = z
  .string()
  .refine(
    (value) => [...sourceCatalog, ...legacySourceCatalog].some((source) => source.slug === value),
    "Unknown audit source",
  );
const checkSchema = z
  .object({
    sourceSlug: slug,
    status: z.enum(["healthy", "degraded", "failed", "skipped"]),
    adapter: z.enum([
      "rss",
      "github-releases",
      "json-api",
      "generic-api",
      "web-scraper",
      "manual",
      "arxiv",
      "aihot",
      "huggingnews",
    ]),
    adapterVersion: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/),
    contractFingerprint: hash.nullable(),
    accessStatus: z.enum(["reachable", "unreachable", "not_checked", "not_observed"]),
    fetchStatus: z.enum(["succeeded", "failed", "not_modified", "not_started", "policy_skipped"]),
    parseStatus: z.enum([
      "succeeded",
      "failed",
      "empty",
      "not_started",
      "unsupported",
      "not_applicable",
    ]),
    schemaStatus: z.enum(["valid", "partial", "invalid", "empty", "unknown", "not_applicable"]),
    policyStatus: z.enum(["allowed_metadata", "pending", "restricted", "unknown", "manual_review"]),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    itemCount: count,
    duplicateRatioBps: count.max(10000),
    qualityScore: count.max(100),
    latestItemAt: timestamp.nullable(),
    freshnessHours: count.nullable(),
    hasError: z.boolean(),
    startedAt: timestamp,
    finishedAt: timestamp,
  })
  .strict();
const payloadSchema = z
  .object({
    runHash: hash,
    targetSlugs: z.array(slug).min(1),
    status: z.enum(["running", "succeeded", "partial", "failed"]),
    startedAt: timestamp,
    finishedAt: timestamp.nullable(),
    auditComplete: z.boolean(),
    incomplete: z.boolean(),
    expectedSourceCount: count,
    collectedCount: count,
    healthyCount: count,
    skippedCount: count,
    errorCount: count,
    checks: z.array(checkSchema),
  })
  .strict();
const evidenceSchema = payloadSchema.extend({ contentHash: hash }).strict();
export type PriorityAuditEvidence = z.infer<typeof evidenceSchema>;

function runHash(startedAt: string, targetSlugs: string[]) {
  return sha256(JSON.stringify({ startedAt, targetSlugs: [...targetSlugs].sort() }));
}

export function validatePriorityAuditEvidence(value: unknown): PriorityAuditEvidence[] {
  const records = z.array(evidenceSchema).parse(value);
  const canonicalRecords = [...records].sort((a, b) => a.runHash.localeCompare(b.runHash));
  if (records.some((record, index) => record.runHash !== canonicalRecords[index]?.runHash))
    throw new Error("Noncanonical priority audit evidence order");
  const seen = new Set<string>();
  for (const record of records) {
    const { contentHash, ...payload } = record;
    const targets = new Set(record.targetSlugs);
    const members = new Set(record.checks.map((check) => check.sourceSlug));
    const targetOrder = [...targets].sort();
    const memberOrder = [...members].sort((a, b) => a.localeCompare(b));
    const start = Date.parse(record.startedAt);
    const finish = record.finishedAt === null ? null : Date.parse(record.finishedAt);
    const failures = record.checks.filter((check) => check.status === "failed").length;
    const healthy = record.checks.filter((check) => check.status === "healthy").length;
    const skipped = record.checks.filter((check) => check.status === "skipped").length;
    const terminalStatus = record.errorCount
      ? record.healthyCount
        ? "partial"
        : "failed"
      : "succeeded";
    if (
      seen.has(record.runHash) ||
      record.runHash !== runHash(record.startedAt, record.targetSlugs) ||
      contentHash !== sha256(JSON.stringify(payloadSchema.parse(payload))) ||
      record.targetSlugs.some((target, index) => target !== targetOrder[index]) ||
      record.checks.some((check, index) => check.sourceSlug !== memberOrder[index]) ||
      targets.size !== record.targetSlugs.length ||
      members.size !== record.checks.length ||
      !record.targetSlugs.some((target) => embodiedPrioritySourceSlugs.includes(target)) ||
      record.expectedSourceCount !== targets.size ||
      record.collectedCount > targets.size ||
      record.healthyCount + record.skippedCount > record.collectedCount ||
      record.errorCount > targets.size + 1 ||
      start > Date.now() ||
      (finish !== null && finish > Date.now()) ||
      record.checks.some((check) => !targets.has(check.sourceSlug)) ||
      (record.status === "running"
        ? finish !== null ||
          record.auditComplete ||
          record.incomplete ||
          record.collectedCount !== 0 ||
          record.healthyCount !== 0 ||
          record.skippedCount !== 0 ||
          record.errorCount !== 0
        : finish === null ||
          finish < start ||
          record.status !== terminalStatus ||
          record.auditComplete === record.incomplete ||
          record.collectedCount !== members.size ||
          record.healthyCount !== healthy ||
          record.skippedCount !== skipped ||
          record.errorCount !== failures + Number(record.incomplete)) ||
      record.checks.some(
        (check) =>
          Date.parse(check.startedAt) < start ||
          Date.parse(check.finishedAt) > Date.now() ||
          Date.parse(check.startedAt) > Date.parse(check.finishedAt) ||
          (finish !== null && Date.parse(check.finishedAt) > finish),
      ) ||
      (record.auditComplete && (record.incomplete || members.size !== targets.size))
    ) {
      throw new Error("Invalid or conflicting priority audit evidence");
    }
    seen.add(record.runHash);
  }
  return records;
}

export async function exportPriorityAuditEvidence(db: Kysely<DatabaseSchema>) {
  const [sources, jobs, checks] = await Promise.all([
    db.selectFrom("sources").select(["id", "slug"]).execute(),
    db.selectFrom("jobs").selectAll().where("type", "=", "source-audit").execute(),
    db.selectFrom("source_checks").selectAll().execute(),
  ]);
  const slugById = new Map(sources.map((source) => [source.id, source.slug]));
  const records: PriorityAuditEvidence[] = [];
  const checkIds = new Set<string>();
  for (const job of jobs) {
    let details: Record<string, unknown>;
    try {
      details = JSON.parse(job.details_json);
      if (!details || typeof details !== "object" || Array.isArray(details)) details = {};
    } catch {
      details = {};
    }
    const targets = Array.isArray(details.targetSourceIds)
      ? details.targetSourceIds
      : job.source_id
        ? [job.source_id]
        : [];
    const members = checks.filter((check) => check.job_id === job.id);
    const relevant = [
      ...targets,
      ...members.filter((check) => check.contract_fingerprint).map((check) => check.source_id),
    ].some((id) => embodiedPrioritySourceSlugs.includes(slugById.get(id) ?? ""));
    if (!relevant) continue;
    if (
      details.auditComplete === true &&
      (!Array.isArray(details.targetSourceIds) ||
        !Number.isSafeInteger(details.expectedSourceCount) ||
        !Array.isArray(details.errors) ||
        details.errors.some((error) => typeof error !== "string"))
    )
      throw new Error("Invalid completed priority audit metadata");
    if (!targets.length || targets.some((id) => typeof id !== "string" || !slugById.has(id)))
      throw new Error("Priority audit targets cannot be exported");
    const targetSlugs = targets.map((id) => slugById.get(id) as string).sort();
    const payload = payloadSchema.parse({
      runHash: runHash(job.started_at, targetSlugs),
      targetSlugs,
      status: job.status,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
      auditComplete: details.auditComplete === true,
      incomplete: /AUDIT[_\s-]INCOMPLETE/i.test(
        `${job.error_summary ?? ""} ${JSON.stringify(details.errors ?? [])}`,
      ),
      expectedSourceCount: details.expectedSourceCount ?? targets.length,
      collectedCount: job.collected_count,
      healthyCount: job.created_count,
      skippedCount: job.skipped_count,
      errorCount: job.error_count,
      checks: members
        .map((check) => ({
          sourceSlug: slugById.get(check.source_id),
          status: check.status,
          adapter: check.adapter,
          adapterVersion: check.adapter_version,
          contractFingerprint: check.contract_fingerprint,
          accessStatus: check.access_status,
          fetchStatus: check.fetch_status,
          parseStatus: check.parse_status,
          schemaStatus: check.schema_status,
          policyStatus: check.policy_status,
          httpStatus: check.http_status,
          itemCount: check.item_count,
          duplicateRatioBps: check.duplicate_ratio_bps,
          qualityScore: check.quality_score,
          latestItemAt: check.latest_item_at,
          freshnessHours: check.freshness_hours,
          hasError: Boolean(check.error_type || check.error_code || check.error_summary),
          startedAt: check.started_at,
          finishedAt: check.finished_at,
        }))
        .sort((a, b) => (a.sourceSlug ?? "").localeCompare(b.sourceSlug ?? "")),
    });
    records.push({ ...payload, contentHash: sha256(JSON.stringify(payload)) });
    for (const check of members) checkIds.add(check.id);
  }
  records.sort((left, right) => left.runHash.localeCompare(right.runHash));
  return { records: validatePriorityAuditEvidence(records), checkIds };
}

export async function restorePriorityAuditEvidence(db: Kysely<DatabaseSchema>, input: unknown) {
  const records = validatePriorityAuditEvidence(input);
  const existing = await exportPriorityAuditEvidence(db);
  const existingByHash = new Map(
    existing.records.map((record) => [record.runHash, record.contentHash]),
  );
  const sources = await db.selectFrom("sources").select(["id", "slug"]).execute();
  const idBySlug = new Map(sources.map((source) => [source.slug, source.id]));
  for (const record of records) {
    const current = existingByHash.get(record.runHash);
    if (current) {
      if (current !== record.contentHash) throw new Error("Conflicting priority audit history");
      continue;
    }
    const targetSourceIds = record.targetSlugs.map((slug) => {
      const id = idBySlug.get(slug);
      if (!id) throw new Error("Priority audit source is missing");
      return id;
    });
    const jobId = `priority-audit:${record.runHash}`;
    await db
      .insertInto("jobs")
      .values({
        id: jobId,
        type: "source-audit",
        status: record.status,
        source_id: null,
        started_at: record.startedAt,
        finished_at: record.finishedAt,
        collected_count: record.collectedCount,
        created_count: record.healthyCount,
        skipped_count: record.skippedCount,
        error_count: record.errorCount,
        error_summary: record.incomplete
          ? "AUDIT_INCOMPLETE"
          : record.errorCount
            ? "AUDIT_MEMBER_FAILED"
            : null,
        details_json: JSON.stringify({
          targetSourceIds,
          expectedSourceCount: record.expectedSourceCount,
          auditComplete: record.auditComplete,
          errors: record.incomplete
            ? ["AUDIT_INCOMPLETE"]
            : Array.from({ length: record.errorCount }, () => "AUDIT_MEMBER_FAILED"),
        }),
      })
      .execute();
    for (const check of record.checks) {
      const row: NewSourceCheckRow = {
        id: `priority-check:${sha256(`${record.runHash}:${check.sourceSlug}`)}`,
        source_id: idBySlug.get(check.sourceSlug) as string,
        job_id: jobId,
        status: check.status,
        adapter: check.adapter,
        adapter_version: check.adapterVersion,
        contract_fingerprint: check.contractFingerprint,
        access_status: check.accessStatus,
        fetch_status: check.fetchStatus,
        parse_status: check.parseStatus,
        schema_status: check.schemaStatus,
        policy_status: check.policyStatus,
        http_status: check.httpStatus,
        final_url: null,
        content_type: null,
        response_bytes: 0,
        item_count: check.itemCount,
        duplicate_count: 0,
        duplicate_ratio_bps: check.duplicateRatioBps,
        quality_score: check.qualityScore,
        latest_item_at: check.latestItemAt,
        freshness_hours: check.freshnessHours,
        error_type: check.hasError ? "restored_audit_error" : null,
        error_code: null,
        error_summary: null,
        repair_action: "review_audit_evidence",
        proxy_hint: "not_applicable",
        proxy_used: 0,
        retention_decision: "observe",
        recommended_lifecycle: "shadow",
        sample_json: "{}",
        started_at: check.startedAt,
        finished_at: check.finishedAt,
        duration_ms: Date.parse(check.finishedAt) - Date.parse(check.startedAt),
      };
      await db.insertInto("source_checks").values(row).execute();
    }
  }
}
