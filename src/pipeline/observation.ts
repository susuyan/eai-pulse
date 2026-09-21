import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { z } from "zod";
import {
  embodiedPrioritySources,
  priorityCatalogFingerprint,
  prioritySourceContracts,
} from "../catalog/embodied-data/priority-sources.js";
import { embodiedSourceCatalog } from "../catalog/embodied-data/sources.js";
import { Repository } from "../db/repository.js";
import type { DatabaseSchema, SourceCheckRow, SourceRow } from "../db/types.js";
import { sourceRowContractFingerprint } from "../domain/source-contract.js";
import { transitionSource } from "../domain/source-lifecycle.js";

export interface ObservationEligibility {
  sourceId: string;
  slug: string;
  eligible: boolean;
  observationEnabled: boolean;
  latestStatus: string | null;
  itemCount: number;
  qualityScore: number;
  freshnessHours: number | null;
  reason: string | null;
  checkIds: string[];
}

export async function observationEligibility(
  db: Kysely<DatabaseSchema>,
): Promise<ObservationEligibility[]> {
  const repository = new Repository(db);
  const [sources, checks] = await Promise.all([
    repository.listSources(),
    db
      .selectFrom("source_checks")
      .leftJoin("jobs", "jobs.id", "source_checks.job_id")
      .selectAll("source_checks")
      .select([
        "jobs.type as jobType",
        "jobs.status as jobStatus",
        "jobs.finished_at as jobFinishedAt",
        "jobs.started_at as jobStartedAt",
        "jobs.details_json as jobDetails",
        "jobs.error_summary as jobErrorSummary",
        "jobs.error_count as jobErrorCount",
        "jobs.collected_count as jobCollectedCount",
        "jobs.created_count as jobCreatedCount",
        "jobs.skipped_count as jobSkippedCount",
      ])
      .execute(),
  ]);
  const checksBySource = new Map<string, typeof checks>();
  const checksByJob = new Map<string, typeof checks>();
  for (const check of checks) {
    const group = checksBySource.get(check.source_id) ?? [];
    group.push(check);
    checksBySource.set(check.source_id, group);
    if (check.job_id) {
      const jobChecks = checksByJob.get(check.job_id) ?? [];
      jobChecks.push(check);
      checksByJob.set(check.job_id, jobChecks);
    }
  }
  const now = Date.now();
  return sources.map((source) => {
    const history = checksBySource.get(source.id) ?? [];
    const checkIds: string[] = [];
    const reason = observationRejection(source, history, now, checkIds, checksByJob);
    const check = latestObservedCheck(history);
    return {
      sourceId: source.id,
      slug: source.slug,
      eligible: reason === null,
      observationEnabled: source.observation_enabled === 1,
      latestStatus: check?.status ?? null,
      itemCount: check?.item_count ?? 0,
      qualityScore: check?.quality_score ?? 0,
      freshnessHours: check?.freshness_hours ?? null,
      reason,
      checkIds,
    };
  });
}

export async function setObservationMode(
  db: Kysely<DatabaseSchema>,
  sourceId: string,
  enabled: boolean,
  options: { allowDraft?: boolean } = {},
): Promise<ObservationEligibility> {
  return db.transaction().execute(async (transaction) => {
    const repository = new Repository(transaction);
    const source = await repository.getSource(sourceId);
    if (enabled && options.allowDraft === false && source?.lifecycle_status !== "shadow") {
      throw new Error("Automatic observation requires current shadow lifecycle");
    }
    const eligibility = (await observationEligibility(transaction)).find(
      (item) => item.sourceId === sourceId,
    );
    if (!eligibility || !source) throw new Error("Source not found");
    if (enabled && !eligibility.eligible) {
      throw new Error(`Source is not eligible for shadow observation: ${eligibility.reason}`);
    }
    const verify = enabled && source.lifecycle_status === "draft";
    if (!verify && source.observation_enabled === (enabled ? 1 : 0)) return eligibility;
    const lifecycle = verify
      ? transitionSource(source.lifecycle_status, "verify")
      : source.lifecycle_status;
    const timestamp = new Date().toISOString();
    await transaction
      .updateTable("sources")
      .set({
        observation_enabled: enabled ? 1 : 0,
        updated_at: timestamp,
        ...(verify
          ? {
              lifecycle_status: lifecycle,
              enabled: 0,
              maintenance_status: "candidate",
              retired_at: null,
            }
          : {}),
      })
      .where("id", "=", sourceId)
      .execute();
    await transaction
      .insertInto("jobs")
      .values({
        id: randomUUID(),
        type: "observation_mode",
        status: "succeeded",
        source_id: sourceId,
        started_at: timestamp,
        finished_at: timestamp,
        collected_count: 0,
        created_count: 0,
        skipped_count: 0,
        error_count: 0,
        error_summary: null,
        details_json: JSON.stringify({
          from: source.lifecycle_status,
          to: lifecycle,
          action: verify ? "verify" : "toggle_observation",
          observationEnabled: enabled,
          actor: "observation_control",
          reason: enabled ? "observation_eligibility_passed" : "observation_disabled",
          adapter: source.adapter,
          adapterVersion: source.adapter_version,
          policy:
            prioritySourceContracts.find((entry) => entry.slug === source.slug)?.policy ?? null,
          checkIds: eligibility.checkIds,
        }),
      })
      .execute();
    return { ...eligibility, observationEnabled: enabled };
  });
}

export async function releaseObservationTriage(
  db: Kysely<DatabaseSchema>,
  sourceId: string,
): Promise<number> {
  const rows = await db
    .selectFrom("signal_triage")
    .innerJoin("signals", "signals.id", "signal_triage.signal_id")
    .select("signal_triage.signal_id")
    .where("signals.source_id", "=", sourceId)
    .where("signal_triage.reason", "=", "shadow_observation")
    .execute();
  for (let index = 0; index < rows.length; index += 200) {
    const ids = rows.slice(index, index + 200).map((row) => row.signal_id);
    if (ids.length) await db.deleteFrom("signal_triage").where("signal_id", "in", ids).execute();
  }
  return rows.length;
}

export async function autoEnableObservation(
  db: Kysely<DatabaseSchema>,
): Promise<{ enabled: number; slugs: string[] }> {
  const shadows = await db
    .selectFrom("sources")
    .select("id")
    .where("lifecycle_status", "=", "shadow")
    .execute();
  const shadowIds = new Set(shadows.map((source) => source.id));
  const rows = (await observationEligibility(db)).filter(
    (item) => shadowIds.has(item.sourceId) && item.eligible && !item.observationEnabled,
  );
  for (const row of rows) {
    await setObservationMode(db, row.sourceId, true, { allowDraft: false });
  }

  return { enabled: rows.length, slugs: rows.map((row) => row.slug) };
}

type ObservationCheck = SourceCheckRow & {
  jobType: string | null;
  jobStatus: string | null;
  jobFinishedAt: string | null;
  jobStartedAt: string | null;
  jobDetails: string | null;
  jobErrorSummary: string | null;
  jobErrorCount: number | null;
  jobCollectedCount: number | null;
  jobCreatedCount: number | null;
  jobSkippedCount: number | null;
};

function observationRejection(
  source: SourceRow,
  checks: ObservationCheck[],
  now: number,
  checkIds: string[],
  checksByJob: Map<string, ObservationCheck[]>,
): string | null {
  const catalog = embodiedSourceCatalog.find((entry) => entry.slug === source.slug);
  if (source.content_scope !== "embodied-data" || !catalog) return "outside_current_scope";
  if (
    source.maintenance_status === "restricted" ||
    source.map_status === "restricted" ||
    catalog.maintenanceStatus === "restricted" ||
    catalog.mapStatus === "restricted"
  )
    return "source_restricted";
  if (
    source.retired_at ||
    source.maintenance_status === "retired" ||
    String(catalog.lifecycleStatus) === "retired"
  )
    return "source_retired";
  if (!["draft", "shadow"].includes(source.lifecycle_status)) return "lifecycle_not_shadow";
  const priority = embodiedPrioritySources.find((entry) => entry.slug === source.slug);
  if (source.lifecycle_status === "draft" && !priority) return "missing_priority_contract";
  if (source.role === "aggregator" || source.source_category === "aggregator")
    return "aggregator_discovery_only";
  if (["manual", "social"].includes(source.acquisition) || source.adapter === "manual")
    return "non_automated_source";
  if (priority) {
    const contract = prioritySourceContracts.find((entry) => entry.slug === source.slug);
    if (contract?.status !== "passed") return "missing_priority_contract";
    if (
      [source.adapter, catalog.adapter, contract.adapter].some(
        (adapter) => adapter !== priority.adapter,
      ) ||
      [source.adapter_version, catalog.adapterVersion, contract.adapterVersion].some(
        (version) => version !== priority.adapterVersion,
      )
    )
      return "adapter_contract_mismatch";
    try {
      if (
        catalog.endpoint !== priority.endpoint ||
        sourceRowContractFingerprint(source) !== contract.contractFingerprint ||
        priorityCatalogFingerprint(catalog) !== contract.contractFingerprint
      )
        return "adapter_config_mismatch";
    } catch {
      return "adapter_config_mismatch";
    }
    if (contract.policy.status !== "allowed_metadata") return `policy_${contract.policy.status}`;
    const reviewedAt = Date.parse(contract.policy.reviewedAt ?? "");
    if (
      !Number.isFinite(reviewedAt) ||
      reviewedAt > now ||
      !contract.policy.reviewer?.trim() ||
      !contract.policy.reason?.trim()
    )
      return "policy_review_missing";
    return priorityWindowRejection(
      source,
      checks,
      now,
      checkIds,
      checksByJob,
      contract.contractFingerprint,
    );
  }
  if (checks.some((check) => evidenceTime(check.finished_at) === null)) return "invalid_check_time";
  checks.sort((left, right) => Date.parse(right.finished_at) - Date.parse(left.finished_at));
  const check = checks[0];
  const reason = contentRejection(check);
  if (!reason && check) checkIds.push(check.id);
  return reason;
}

function contentRejection(check?: SourceCheckRow): string | null {
  if (!check) return "missing_check";
  if (check.status !== "healthy") return `latest_check_${check.status}`;
  if (check.policy_status !== "allowed_metadata") return `policy_${check.policy_status}`;
  if (check.item_count < 1) return "empty_content";
  if (check.quality_score < 60) return "quality_below_60";
  if (check.freshness_hours === null) return "missing_freshness";
  if (check.freshness_hours > 2_160) return "content_older_than_90_days";
  return null;
}

function priorityWindowRejection(
  source: SourceRow,
  checks: ObservationCheck[],
  now: number,
  checkIds: string[],
  checksByJob: Map<string, ObservationCheck[]>,
  contractFingerprint: string,
): string | null {
  const times = new Map<string, { start: number; finish: number }>();
  // Validate before sorting: corrupt failures cannot fall behind the candidate window.
  for (const check of checks) {
    const start = evidenceTime(check.started_at);
    const finish = evidenceTime(check.finished_at);
    const jobStart = evidenceTime(check.jobStartedAt);
    const jobFinish = evidenceTime(check.jobFinishedAt);
    if (
      start === null ||
      finish === null ||
      jobStart === null ||
      jobFinish === null ||
      jobStart > start ||
      start > finish ||
      finish > jobFinish ||
      jobFinish > now
    )
      return "invalid_check_time";
    times.set(check.id, { start, finish });
  }
  checks.sort(
    (left, right) =>
      Date.parse(right.finished_at) - Date.parse(left.finished_at) ||
      Date.parse(right.started_at) - Date.parse(left.started_at),
  );
  const latest = checks[0];
  if (!latest) return "missing_check";
  if (now - Date.parse(latest.finished_at) > 24 * 3_600_000) return "latest_check_stale";
  let newerStart: number | undefined;
  const jobs = new Set<string>();
  for (const check of checks) {
    const time = times.get(check.id);
    if (!time) return "invalid_check_time";
    const { start, finish } = time;
    const reason = contentRejection(check);
    if (
      reason ||
      check.contract_fingerprint !== contractFingerprint ||
      check.adapter !== source.adapter ||
      check.adapter_version !== source.adapter_version ||
      check.http_status === null ||
      check.http_status < 200 ||
      check.http_status >= 300 ||
      check.access_status !== "reachable" ||
      check.fetch_status !== "succeeded" ||
      check.parse_status !== "succeeded" ||
      check.schema_status !== "valid" ||
      check.duplicate_ratio_bps < 0 ||
      check.duplicate_ratio_bps >= 8000 ||
      check.error_type ||
      check.error_code ||
      check.error_summary ||
      !check.job_id ||
      !completedAudit(check, checksByJob.get(check.job_id ?? "") ?? [])
    ) {
      return checkIds.length === 0
        ? (reason ?? "invalid_live_check")
        : "healthy_window_below_3_checks";
    }
    if (jobs.has(check.job_id)) continue;
    if (newerStart !== undefined && newerStart - finish < 6 * 3_600_000) continue;
    checkIds.push(check.id);
    jobs.add(check.job_id);
    newerStart = start;
    if (checkIds.length === 3) return null;
  }
  return "healthy_window_below_3_checks";
}

const evidenceTimestamp = z.string().datetime({ offset: true });

function evidenceTime(value: string | null): number | null {
  if (!evidenceTimestamp.safeParse(value).success) return null;
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : null;
}

function latestObservedCheck(checks: ObservationCheck[]): ObservationCheck | undefined {
  let latest: ObservationCheck | undefined;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const check of checks) {
    const time = evidenceTime(check.finished_at);
    if (time === null) return undefined;
    if (time > latestTime) {
      latest = check;
      latestTime = time;
    }
  }
  return latest;
}

function completedAudit(check: ObservationCheck, members: ObservationCheck[]): boolean {
  if (
    !check.job_id ||
    check.jobType !== "source-audit" ||
    !["succeeded", "partial"].includes(check.jobStatus ?? "")
  )
    return false;
  const jobStart = evidenceTime(check.jobStartedAt);
  const jobFinish = evidenceTime(check.jobFinishedAt);
  if (
    jobStart === null ||
    jobFinish === null ||
    members.some((member) => {
      const start = evidenceTime(member.started_at);
      const finish = evidenceTime(member.finished_at);
      return (
        start === null ||
        finish === null ||
        jobStart > start ||
        start > finish ||
        finish > jobFinish
      );
    })
  )
    return false;
  let details: { auditComplete?: unknown; expectedSourceCount?: unknown; errors?: unknown };
  try {
    details = JSON.parse(check.jobDetails ?? "null");
  } catch {
    return false;
  }
  if (
    details?.auditComplete !== true ||
    !Number.isSafeInteger(details.expectedSourceCount) ||
    details.expectedSourceCount !== members.length ||
    members.length === 0 ||
    new Set(members.map((member) => member.source_id)).size !== members.length ||
    !Array.isArray(details.errors) ||
    details.errors.some((error) => typeof error !== "string") ||
    /AUDIT[_\s-]INCOMPLETE/i.test(
      `${check.jobErrorSummary ?? ""} ${JSON.stringify(details.errors)}`,
    )
  )
    return false;
  const failures = members.filter((member) => member.status === "failed").length;
  const healthy = members.filter((member) => member.status === "healthy").length;
  if (
    check.jobCollectedCount !== members.length ||
    check.jobCreatedCount !== healthy ||
    check.jobErrorCount !== failures ||
    check.jobSkippedCount !== members.filter((member) => member.status === "skipped").length
  )
    return false;
  return check.jobStatus === "succeeded" ? failures === 0 : failures > 0 && healthy > 0;
}
