import type { Kysely } from "kysely";
import { Repository } from "../db/repository.js";
import type { DatabaseSchema } from "../db/types.js";
import { discoverNewSources, saveDiscoveredSources } from "./discovery.js";
import { rootDomain } from "./utils.js";

export interface SourcePortfolioResult {
  checked: number;
  degraded: string[];
  quarantined: string[];
  restoredToShadow: string[];
  observationDisabled: string[];
}

export interface RadarTriageResult {
  checked: number;
  matched: number;
  merged: number;
  candidates: number;
  insufficientIdentity: number;
  proposalsCreated: number;
  remaining: number;
}

export async function reconcileSourcePortfolio(
  db: Kysely<DatabaseSchema>,
): Promise<SourcePortfolioResult> {
  const repository = new Repository(db);
  const [sources, checks] = await Promise.all([
    repository.listSources(),
    repository.listSourceChecks(undefined, 2_000),
  ]);
  const checksBySource = new Map<string, typeof checks>();
  for (const check of checks) {
    const group = checksBySource.get(check.source_id) ?? [];
    group.push(check);
    checksBySource.set(check.source_id, group);
  }

  const result: SourcePortfolioResult = {
    checked: sources.length,
    degraded: [],
    quarantined: [],
    restoredToShadow: [],
    observationDisabled: [],
  };
  const timestamp = new Date().toISOString();

  for (const source of sources) {
    if (source.lifecycle_status === "retired") continue;
    const decisive = (checksBySource.get(source.id) ?? []).filter(
      (check) => check.status !== "skipped",
    );
    const leadingFailures = takeWhile(decisive, (check) => check.status === "failed").length;
    const leadingHealthy = takeWhile(decisive, (check) => check.status === "healthy").length;
    const leadingUnhealthy = takeWhile(
      decisive,
      (check) => check.status === "failed" || check.status === "degraded",
    ).length;

    if (source.observation_enabled === 1 && decisive[0]?.status !== "healthy") {
      await db
        .updateTable("sources")
        .set({ observation_enabled: 0, updated_at: timestamp })
        .where("id", "=", source.id)
        .execute();
      result.observationDisabled.push(source.slug);
    }

    if (source.lifecycle_status === "quarantined" && leadingHealthy >= 3) {
      await db
        .updateTable("sources")
        .set({
          lifecycle_status: "shadow",
          enabled: 0,
          observation_enabled: 0,
          maintenance_status: "candidate",
          updated_at: timestamp,
        })
        .where("id", "=", source.id)
        .execute();
      result.restoredToShadow.push(source.slug);
      continue;
    }

    if (leadingFailures >= 5 && ["active", "degraded"].includes(source.lifecycle_status)) {
      await db
        .updateTable("sources")
        .set({
          lifecycle_status: "quarantined",
          enabled: 0,
          observation_enabled: 0,
          maintenance_status: "candidate",
          updated_at: timestamp,
        })
        .where("id", "=", source.id)
        .execute();
      result.quarantined.push(source.slug);
      continue;
    }

    if (leadingUnhealthy >= 2 && source.lifecycle_status === "active") {
      await db
        .updateTable("sources")
        .set({ lifecycle_status: "degraded", enabled: 1, updated_at: timestamp })
        .where("id", "=", source.id)
        .execute();
      result.degraded.push(source.slug);
    }
  }

  return result;
}

export async function triageSourceRadar(db: Kysely<DatabaseSchema>): Promise<RadarTriageResult> {
  const rows = await db
    .selectFrom("source_discoveries")
    .selectAll()
    .where("status", "in", ["pending", "candidate"])
    .orderBy("last_seen_at", "desc")
    .limit(2_000)
    .execute();
  const [sources, signals] = await Promise.all([
    db
      .selectFrom("sources")
      .select(["id", "homepage_url", "role", "source_category", "lifecycle_status"])
      .execute(),
    db.selectFrom("signals").select(["id", "source_id", "url_hash"]).execute(),
  ]);
  const signalByHash = new Map(signals.map((signal) => [signal.url_hash, signal]));
  const sourcesByRoot = new Map<string, string[]>();
  for (const source of sources) {
    if (source.role === "aggregator" || source.source_category === "aggregator") continue;
    const root = urlRoot(source.homepage_url);
    if (!root) continue;
    sourcesByRoot.set(root, [...(sourcesByRoot.get(root) ?? []), source.id]);
  }

  let matched = 0;
  let merged = 0;
  let insufficientIdentity = 0;
  const timestamp = new Date().toISOString();
  for (const row of rows) {
    if (row.status === "pending" && !row.origin_url && row.origin_kind === "aggregator_story") {
      await db
        .updateTable("source_discoveries")
        .set({ status: "insufficient_identity", updated_at: timestamp })
        .where("id", "=", row.id)
        .execute();
      insufficientIdentity += 1;
      continue;
    }
    const exactSignal = row.origin_url_hash ? signalByHash.get(row.origin_url_hash) : undefined;
    if (exactSignal) {
      await db
        .updateTable("source_discoveries")
        .set({
          status: "merged_signal",
          matched_source_id: exactSignal.source_id,
          matched_signal_id: exactSignal.id,
          updated_at: timestamp,
        })
        .where("id", "=", row.id)
        .execute();
      merged += 1;
      continue;
    }
    const root = row.origin_url ? urlRoot(row.origin_url) : null;
    const sourceIds = root ? (sourcesByRoot.get(root) ?? []) : [];
    if (sourceIds.length === 1) {
      await db
        .updateTable("source_discoveries")
        .set({
          status: "matched_source",
          matched_source_id: sourceIds[0] ?? null,
          candidate_source_ids_json: "[]",
          updated_at: timestamp,
        })
        .where("id", "=", row.id)
        .execute();
      matched += 1;
    }
  }

  const discovery = await discoverNewSources(db, { minSignals: 2, limit: 100 });
  const safeCandidates = discovery.candidates.filter(
    (candidate) => (candidate.score ?? 0) >= 50 && candidate.confidence !== "low",
  );
  const proposals = await saveDiscoveredSources(db, safeCandidates);
  const draftSources = await db
    .selectFrom("sources")
    .select(["id", "homepage_url"])
    .where("lifecycle_status", "=", "draft")
    .execute();
  const draftsByRoot = new Map<string, string>();
  for (const source of draftSources) {
    const root = urlRoot(source.homepage_url);
    if (root) draftsByRoot.set(root, source.id);
  }
  let candidates = 0;
  const unresolved = await db
    .selectFrom("source_discoveries")
    .select(["id", "origin_url"])
    .where("status", "=", "pending")
    .where("origin_url", "is not", null)
    .execute();
  for (const row of unresolved) {
    const root = urlRoot(row.origin_url ?? "");
    const draftId = root ? draftsByRoot.get(root) : undefined;
    if (!draftId) continue;
    await db
      .updateTable("source_discoveries")
      .set({
        status: "candidate",
        candidate_source_ids_json: JSON.stringify([draftId]),
        updated_at: timestamp,
      })
      .where("id", "=", row.id)
      .execute();
    candidates += 1;
  }

  const remainingRow = await db
    .selectFrom("source_discoveries")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("status", "=", "pending")
    .executeTakeFirstOrThrow();
  return {
    checked: rows.length,
    matched,
    merged,
    candidates,
    insufficientIdentity,
    proposalsCreated: proposals.created,
    remaining: Number(remainingRow.count),
  };
}

function urlRoot(value: string): string | null {
  try {
    return rootDomain(new URL(value).hostname.toLowerCase().replace(/^www\./, ""));
  } catch {
    return null;
  }
}

function takeWhile<T>(values: T[], predicate: (value: T) => boolean): T[] {
  const result: T[] = [];
  for (const value of values) {
    if (!predicate(value)) break;
    result.push(value);
  }
  return result;
}
