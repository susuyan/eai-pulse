import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Kysely, sql } from "kysely";
import { z } from "zod";
import { seedDatabase } from "../db/seed.js";
import type { DatabaseSchema } from "../db/types.js";
import { sha256 } from "../domain/url.js";
import { writeVerifiedRepositorySnapshot } from "./snapshot.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const gitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);

const SnapshotCountsSchema = z
  .object({
    sources: z.number().int().nonnegative(),
    sourceChecks: z.number().int().nonnegative(),
    sourceRuns: z.number().int().nonnegative(),
    signals: z.number().int().nonnegative(),
    signalObservations: z.number().int().nonnegative(),
    signalObservationOccurrences: z.number().int().nonnegative(),
    signalTriage: z.number().int().nonnegative(),
    discoveries: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
    eventDataProfiles: z.number().int().nonnegative(),
    datasets: z.number().int().nonnegative(),
    datasetEvents: z.number().int().nonnegative(),
    standards: z.number().int().nonnegative(),
    standardEvents: z.number().int().nonnegative(),
    collectionMethods: z.number().int().nonnegative(),
    collectionMethodEvents: z.number().int().nonnegative(),
    actorDataCapabilities: z.number().int().nonnegative(),
    actorCapabilityEvidence: z.number().int().nonnegative(),
    eventSignals: z.number().int().nonnegative(),
    eventTracks: z.number().int().nonnegative(),
    eventActors: z.number().int().nonnegative(),
    eventMerges: z.number().int().nonnegative(),
    scoutInsights: z.number().int().nonnegative(),
    scoutEvidence: z.number().int().nonnegative(),
    evaluationRuns: z.number().int().nonnegative(),
  })
  .strict();

export const EmbodiedDataMigrationBaselineSchema = z
  .object({
    schemaVersion: z.literal(1),
    capturedAt: z.string().datetime({ offset: true }),
    baseGitSha: gitShaSchema,
    snapshotSha256: sha256Schema,
    publicFingerprint: sha256Schema,
    pagesRunId: z.number().int().positive(),
    pagesHeadSha: gitShaSchema,
    pagesUpdatedAt: z.string().datetime({ offset: true }),
    pagesRunUrl: z.string().url(),
    pagesUrl: z.string().url(),
    snapshotCounts: SnapshotCountsSchema,
  })
  .strict();

export type EmbodiedDataMigrationBaseline = z.infer<typeof EmbodiedDataMigrationBaselineSchema>;

export interface EmbodiedDataMigrationPlan {
  current: {
    sources: number;
    signals: number;
    events: number;
    actors: number;
    eventDataProfiles: number;
    datasets: number;
    standards: number;
    collectionMethods: number;
    actorDataCapabilities: number;
  };
  legacy: {
    sources: number;
    signals: number;
    events: number;
    actors: number;
    scoutInsights: number;
  };
  retired: { sources: number };
  changes: { inserted: number; updated: number; relations: number };
}

export async function readEmbodiedDataMigrationBaseline(
  path: string,
): Promise<EmbodiedDataMigrationBaseline> {
  return EmbodiedDataMigrationBaselineSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function assertMigrationSnapshotMatchesBaseline(
  baseline: EmbodiedDataMigrationBaseline,
  snapshotPath: string,
): Promise<void> {
  const actual = createHash("sha256")
    .update(await readFile(snapshotPath))
    .digest("hex");
  if (actual !== baseline.snapshotSha256) {
    throw new Error(
      `Snapshot hash mismatch: expected ${baseline.snapshotSha256}, received ${actual}`,
    );
  }
}

export async function planEmbodiedDataMigration(
  db: Kysely<DatabaseSchema>,
  _baseline: EmbodiedDataMigrationBaseline,
): Promise<EmbodiedDataMigrationPlan> {
  const [current, legacy, retiredSources, scoutInsights] = await Promise.all([
    scopeCounts(db, "embodied-data"),
    scopeCounts(db, "legacy-ai"),
    countWhere(db, "sources", "lifecycle_status", "retired"),
    countAll(db, "scout_insights"),
  ]);
  const [eventDataProfiles, datasets, standards, collectionMethods, actorDataCapabilities] =
    await Promise.all([
      countAll(db, "event_data_profiles"),
      countAll(db, "datasets"),
      countAll(db, "standards"),
      countAll(db, "collection_methods"),
      countAll(db, "actor_data_capabilities"),
    ]);

  return {
    current: {
      ...current,
      eventDataProfiles,
      datasets,
      standards,
      collectionMethods,
      actorDataCapabilities,
    },
    legacy: { ...legacy, scoutInsights },
    retired: { sources: retiredSources },
    changes: { inserted: 0, updated: 0, relations: 0 },
  };
}

export async function applyEmbodiedDataMigration(
  db: Kysely<DatabaseSchema>,
  baseline: EmbodiedDataMigrationBaseline,
): Promise<EmbodiedDataMigrationPlan> {
  return db
    .transaction()
    .execute((transaction) => planEmbodiedDataMigration(transaction, baseline));
}

export async function applyVerifiedEmbodiedDataMigration(
  db: Kysely<DatabaseSchema>,
  baseline: EmbodiedDataMigrationBaseline,
  options: {
    baselineSnapshotPath: string;
    rootDir: string;
    relativePath: string;
    verifySnapshot: (candidate: {
      path: string;
      sha256: string;
      counts: Record<string, number>;
      publicFingerprint: string;
    }) => Promise<void>;
  },
) {
  await assertMigrationSnapshotMatchesBaseline(baseline, options.baselineSnapshotPath);
  const before = await planEmbodiedDataMigration(db, baseline);
  await seedDatabase(db);
  await applyEmbodiedDataMigration(db, baseline);
  const after = await planEmbodiedDataMigration(db, baseline);
  const publicFingerprint = await embodiedPublicFingerprint(db);
  const snapshot = await writeVerifiedRepositorySnapshot(
    db,
    options.rootDir,
    options.relativePath,
    (candidate) => options.verifySnapshot({ ...candidate, publicFingerprint }),
  );
  return {
    before,
    after,
    baselineSnapshotSha256: baseline.snapshotSha256,
    resultSnapshotSha256: snapshot.sha256,
    publicFingerprint,
    roundTripVerified: snapshot.verified,
    snapshotPath: snapshot.path,
    snapshotCounts: snapshot.counts,
  };
}

export async function embodiedPublicFingerprint(db: Kysely<DatabaseSchema>): Promise<string> {
  const [sources, signals, events, tracks, actors, views, scouts, eventTracks, eventEvidence] =
    await Promise.all([
      db
        .selectFrom("sources")
        .select(["slug", "lifecycle_status", "enabled", "observation_enabled"])
        .where("content_scope", "=", "embodied-data")
        .execute(),
      db
        .selectFrom("signals")
        .innerJoin("sources", "sources.id", "signals.source_id")
        .select(["signals.canonical_url", "sources.slug as sourceSlug"])
        .where("signals.content_scope", "=", "embodied-data")
        .where("sources.content_scope", "=", "embodied-data")
        .execute(),
      db
        .selectFrom("events")
        .select(["slug", "status", "happened_at", "published_at"])
        .where("content_scope", "=", "embodied-data")
        .execute(),
      db.selectFrom("tracks").select(["slug", "enabled"]).where("enabled", "=", 1).execute(),
      db
        .selectFrom("actors")
        .select(["slug", "region", "enabled"])
        .where("content_scope", "=", "embodied-data")
        .execute(),
      db
        .selectFrom("views")
        .select(["slug", "status", "is_default"])
        .where("is_default", "=", 1)
        .execute(),
      db
        .selectFrom("scout_insights")
        .innerJoin("scout_evidence", "scout_evidence.insight_id", "scout_insights.id")
        .innerJoin("events", "events.id", "scout_evidence.event_id")
        .select(["scout_insights.slug", "scout_insights.status", "events.slug as eventSlug"])
        .where("events.content_scope", "=", "embodied-data")
        .where("scout_insights.status", "=", "published")
        .execute(),
      db
        .selectFrom("event_tracks")
        .innerJoin("events", "events.id", "event_tracks.event_id")
        .innerJoin("tracks", "tracks.id", "event_tracks.track_id")
        .select(["events.slug as eventSlug", "tracks.slug as trackSlug"])
        .where("events.content_scope", "=", "embodied-data")
        .execute(),
      db
        .selectFrom("event_signals")
        .innerJoin("events", "events.id", "event_signals.event_id")
        .innerJoin("signals", "signals.id", "event_signals.signal_id")
        .select([
          "events.slug as eventSlug",
          "signals.canonical_url as url",
          "event_signals.evidence_role as role",
        ])
        .where("events.content_scope", "=", "embodied-data")
        .where("signals.content_scope", "=", "embodied-data")
        .execute(),
    ]);
  return sha256(
    JSON.stringify(
      [sources, signals, events, tracks, actors, views, scouts, eventTracks, eventEvidence].map(
        (rows) =>
          [...rows].sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right)),
          ),
      ),
    ),
  );
}

async function scopeCounts(db: Kysely<DatabaseSchema>, scope: "legacy-ai" | "embodied-data") {
  const [sources, signals, events, actors] = await Promise.all([
    countWhere(db, "sources", "content_scope", scope),
    countWhere(db, "signals", "content_scope", scope),
    countWhere(db, "events", "content_scope", scope),
    countWhere(db, "actors", "content_scope", scope),
  ]);
  return { sources, signals, events, actors };
}

async function countAll<Table extends keyof DatabaseSchema>(
  db: Kysely<DatabaseSchema>,
  table: Table,
): Promise<number> {
  const result = await sql<{ count: number }>`
    select count(*) as count from ${sql.table(table)}
  `.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

async function countWhere<
  Table extends "sources" | "signals" | "events" | "actors",
  Column extends "content_scope" | "lifecycle_status",
>(db: Kysely<DatabaseSchema>, table: Table, column: Column, value: string): Promise<number> {
  const result = await sql<{ count: number }>`
    select count(*) as count
    from ${sql.table(table)}
    where ${sql.ref(column)} = ${value}
  `.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}
