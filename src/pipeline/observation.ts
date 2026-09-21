import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Kysely } from "kysely";
import {
  embodiedPrioritySources,
  prioritySourceContracts,
} from "../catalog/embodied-data/priority-sources.js";
import { embodiedSourceCatalog } from "../catalog/embodied-data/sources.js";
import { Repository } from "../db/repository.js";
import type { DatabaseSchema, SourceCheckRow, SourceRow } from "../db/types.js";
import { transitionSource } from "../domain/source-lifecycle.js";
import { SourceConfigSchema } from "../domain/types.js";

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
      ])
      .orderBy("source_checks.finished_at", "desc")
      .orderBy("source_checks.started_at", "desc")
      .execute(),
  ]);
  const checksBySource = new Map<string, typeof checks>();
  for (const check of checks) {
    const group = checksBySource.get(check.source_id) ?? [];
    group.push(check);
    checksBySource.set(check.source_id, group);
  }
  const now = Date.now();
  return sources.map((source) => {
    const history = checksBySource.get(source.id) ?? [];
    const check = history[0];
    const checkIds: string[] = [];
    const reason = observationRejection(source, history, now, checkIds);
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
): Promise<ObservationEligibility> {
  return db.transaction().execute(async (transaction) => {
    const repository = new Repository(transaction);
    const source = await repository.getSource(sourceId);
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
    await setObservationMode(db, row.sourceId, true);
  }

  return { enabled: rows.length, slugs: rows.map((row) => row.slug) };
}

type ObservationCheck = SourceCheckRow & {
  jobType: string | null;
  jobStatus: string | null;
  jobFinishedAt: string | null;
};

function observationRejection(
  source: SourceRow,
  checks: ObservationCheck[],
  now: number,
  checkIds: string[],
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
      const config = SourceConfigSchema.parse(JSON.parse(source.config_json));
      if (
        config.url !== priority.endpoint ||
        catalog.endpoint !== priority.endpoint ||
        !isDeepStrictEqual(config.html, catalog.html)
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
    return priorityWindowRejection(source, checks, now, checkIds);
  }
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
): string | null {
  const latest = checks[0];
  if (!latest) return "missing_check";
  if (now - Date.parse(latest.finished_at) > 24 * 3_600_000) return "latest_check_stale";
  let newerStart: number | undefined;
  const jobs = new Set<string>();
  for (const check of checks) {
    const start = Date.parse(check.started_at);
    const finish = Date.parse(check.finished_at);
    const reason = contentRejection(check);
    if (
      reason ||
      !Number.isFinite(start) ||
      !Number.isFinite(finish) ||
      finish < start ||
      finish > now ||
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
      check.jobType !== "source-audit" ||
      !["succeeded", "partial"].includes(check.jobStatus ?? "") ||
      !check.jobFinishedAt
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
