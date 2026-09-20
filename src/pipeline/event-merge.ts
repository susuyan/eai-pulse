import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import { now, Repository } from "../db/repository.js";
import type { DatabaseSchema, EventRow } from "../db/types.js";
import {
  belongsToEvent,
  eventFacet,
  eventFacetBucket,
  eventFingerprint,
} from "../domain/clustering.js";
import { rescoreEvent } from "./cluster.js";

export interface EventMergeCandidate {
  key: string;
  reason: "entity_fingerprint" | "title_similarity";
  confidence: number;
  targetEventId: string;
  events: Array<{
    id: string;
    title: string;
    status: string;
    happenedAt: string;
    evidenceCount: number;
    independentSources: number;
  }>;
}

/**
 * Builds a non-destructive merge queue. A candidate never mutates events; an
 * editor must inspect the evidence and choose whether the records describe one
 * event, a follow-on development, or a genuinely separate milestone.
 */
export async function findEventMergeCandidates(
  db: Kysely<DatabaseSchema>,
): Promise<EventMergeCandidate[]> {
  const [events, evidence] = await Promise.all([
    db.selectFrom("events").selectAll().where("status", "!=", "hidden").execute(),
    db
      .selectFrom("event_signals")
      .innerJoin("signals", "signals.id", "event_signals.signal_id")
      .select(["event_signals.event_id as eventId", "signals.source_id as sourceId"])
      .execute(),
  ]);
  const evidenceByEvent = new Map<string, { count: number; sourceIds: Set<string> }>();
  for (const row of evidence) {
    const current = evidenceByEvent.get(row.eventId) ?? { count: 0, sourceIds: new Set<string>() };
    current.count += 1;
    current.sourceIds.add(row.sourceId);
    evidenceByEvent.set(row.eventId, current);
  }

  const fingerprints = new Map<string, EventRow[]>();
  for (const event of events) {
    const fingerprint = eventFingerprint(event.title);
    if (!fingerprint) continue;
    const facet = eventFacetBucket(eventFacet(event.title));
    const key = `${fingerprint}:${facet}`;
    const group = fingerprints.get(key) ?? [];
    group.push(event);
    fingerprints.set(key, group);
  }

  const groups: EventMergeCandidate[] = [];
  for (const [key, candidates] of fingerprints) {
    const components = connectedComponents(candidates);
    for (const component of components.filter((items) => items.length > 1)) {
      const sorted = [...component].sort((left, right) =>
        compareTargets(left, right, evidenceByEvent),
      );
      groups.push({
        key,
        reason: "entity_fingerprint",
        confidence: Math.min(99, 82 + component.length * 2),
        targetEventId: sorted[0]?.id ?? "",
        events: sorted.map((event) => toCandidateEvent(event, evidenceByEvent)),
      });
    }
  }

  return groups.sort(
    (left, right) => right.events.length - left.events.length || right.confidence - left.confidence,
  );
}

export async function mergeEventCandidates(
  db: Kysely<DatabaseSchema>,
  input: {
    targetEventId: string;
    sourceEventIds: string[];
    reason: string;
    mergedBy: string;
  },
): Promise<{ targetEventId: string; merged: number }> {
  const sourceIds = [...new Set(input.sourceEventIds)].filter(
    (eventId) => eventId !== input.targetEventId,
  );
  if (!sourceIds.length) throw new Error("At least one source event is required");
  const events = await db
    .selectFrom("events")
    .selectAll()
    .where("id", "in", [input.targetEventId, ...sourceIds])
    .execute();
  const target = events.find((event) => event.id === input.targetEventId);
  if (!target) throw new Error("Target event not found");
  const sources = sourceIds.map((eventId) => {
    const source = events.find((event) => event.id === eventId);
    if (!source) throw new Error(`Source event not found: ${eventId}`);
    if (source.content_scope !== target.content_scope) {
      throw new Error("Events from different content scopes cannot be merged");
    }
    if (source.status === "published") {
      throw new Error(`Published source events must be unpublished before merge: ${eventId}`);
    }
    if (
      !belongsToEvent(
        { title: source.title, publishedAt: source.happened_at },
        { title: target.title, happenedAt: target.happened_at },
      )
    ) {
      throw new Error(`Events do not satisfy the current convergence policy: ${eventId}`);
    }
    return source;
  });

  await db.transaction().execute(async (trx) => {
    for (const source of sources) {
      const [
        signals,
        tracks,
        actors,
        datasetEvents,
        standardEvents,
        collectionMethodEvents,
        actorCapabilityEvidence,
        eventDataProfile,
        scoutEvidence,
      ] = await Promise.all([
        trx.selectFrom("event_signals").selectAll().where("event_id", "=", source.id).execute(),
        trx.selectFrom("event_tracks").selectAll().where("event_id", "=", source.id).execute(),
        trx.selectFrom("event_actors").selectAll().where("event_id", "=", source.id).execute(),
        trx.selectFrom("dataset_events").selectAll().where("event_id", "=", source.id).execute(),
        trx.selectFrom("standard_events").selectAll().where("event_id", "=", source.id).execute(),
        trx
          .selectFrom("collection_method_events")
          .selectAll()
          .where("event_id", "=", source.id)
          .execute(),
        trx
          .selectFrom("actor_capability_evidence")
          .selectAll()
          .where("event_id", "=", source.id)
          .execute(),
        trx
          .selectFrom("event_data_profiles")
          .selectAll()
          .where("event_id", "=", source.id)
          .executeTakeFirst(),
        trx.selectFrom("scout_evidence").selectAll().where("event_id", "=", source.id).execute(),
      ]);
      await copyEventDataProfile(trx, input.targetEventId, eventDataProfile);
      await copyAssociations(trx, input.targetEventId, {
        signals,
        tracks,
        actors,
        datasetEvents,
        standardEvents,
        collectionMethodEvents,
        actorCapabilityEvidence,
        scoutEvidence,
      });
      await trx
        .insertInto("event_merges")
        .values({
          id: randomUUID(),
          target_event_id: input.targetEventId,
          source_event_id: source.id,
          source_snapshot_json: JSON.stringify({
            event: source,
            signalIds: signals.map((item) => item.signal_id),
            trackIds: tracks.map((item) => item.track_id),
            actorIds: actors.map((item) => item.actor_id),
            datasetEvents,
            standardEvents,
            collectionMethodEvents,
            actorCapabilityEvidence,
            eventDataProfile: eventDataProfile ?? null,
            scoutEvidence,
          }),
          reason: input.reason.slice(0, 80),
          merged_by: input.mergedBy.slice(0, 80),
          created_at: now(),
        })
        .execute();
      await trx.deleteFrom("events").where("id", "=", source.id).execute();
    }
  });
  await rescoreEvent(new Repository(db), target);
  return { targetEventId: target.id, merged: sources.length };
}

async function copyAssociations(
  db: Kysely<DatabaseSchema>,
  targetEventId: string,
  associations: {
    signals: Array<DatabaseSchema["event_signals"]>;
    tracks: Array<DatabaseSchema["event_tracks"]>;
    actors: Array<DatabaseSchema["event_actors"]>;
    datasetEvents: Array<DatabaseSchema["dataset_events"]>;
    standardEvents: Array<DatabaseSchema["standard_events"]>;
    collectionMethodEvents: Array<DatabaseSchema["collection_method_events"]>;
    actorCapabilityEvidence: Array<DatabaseSchema["actor_capability_evidence"]>;
    scoutEvidence: Array<DatabaseSchema["scout_evidence"]>;
  },
): Promise<void> {
  for (const signal of associations.signals) {
    const exists = await db
      .selectFrom("event_signals")
      .select("signal_id")
      .where("event_id", "=", targetEventId)
      .where("signal_id", "=", signal.signal_id)
      .executeTakeFirst();
    if (!exists)
      await db
        .insertInto("event_signals")
        .values({ ...signal, event_id: targetEventId })
        .execute();
  }
  for (const track of associations.tracks) {
    const exists = await db
      .selectFrom("event_tracks")
      .select("track_id")
      .where("event_id", "=", targetEventId)
      .where("track_id", "=", track.track_id)
      .executeTakeFirst();
    if (!exists)
      await db
        .insertInto("event_tracks")
        .values({ ...track, event_id: targetEventId })
        .execute();
  }
  for (const actor of associations.actors) {
    const exists = await db
      .selectFrom("event_actors")
      .select("actor_id")
      .where("event_id", "=", targetEventId)
      .where("actor_id", "=", actor.actor_id)
      .executeTakeFirst();
    if (!exists)
      await db
        .insertInto("event_actors")
        .values({ ...actor, event_id: targetEventId })
        .execute();
  }
  for (const link of associations.datasetEvents) {
    await db
      .insertInto("dataset_events")
      .values({ ...link, event_id: targetEventId })
      .onConflict((conflict) =>
        conflict.columns(["dataset_id", "event_id", "relation_role"]).doNothing(),
      )
      .execute();
  }
  for (const link of associations.standardEvents) {
    await db
      .insertInto("standard_events")
      .values({ ...link, event_id: targetEventId })
      .onConflict((conflict) =>
        conflict.columns(["standard_id", "event_id", "relation_role"]).doNothing(),
      )
      .execute();
  }
  for (const link of associations.collectionMethodEvents) {
    await db
      .insertInto("collection_method_events")
      .values({ ...link, event_id: targetEventId })
      .onConflict((conflict) =>
        conflict.columns(["collection_method_id", "event_id", "relation_role"]).doNothing(),
      )
      .execute();
  }
  for (const link of associations.actorCapabilityEvidence) {
    await db
      .insertInto("actor_capability_evidence")
      .values({ ...link, event_id: targetEventId })
      .onConflict((conflict) =>
        conflict.columns(["capability_id", "event_id", "evidence_role"]).doNothing(),
      )
      .execute();
  }
  for (const link of associations.scoutEvidence) {
    const target = await db
      .selectFrom("scout_evidence")
      .select(["evidence_role", "weight"])
      .where("insight_id", "=", link.insight_id)
      .where("event_id", "=", targetEventId)
      .executeTakeFirst();
    if (!target) {
      await db
        .insertInto("scout_evidence")
        .values({ ...link, event_id: targetEventId })
        .execute();
    } else if (target.evidence_role !== link.evidence_role || target.weight !== link.weight) {
      throw new Error("Conflicting Scout evidence must be reconciled before merge");
    }
  }
}

async function copyEventDataProfile(
  db: Kysely<DatabaseSchema>,
  targetEventId: string,
  source: Selectable<DatabaseSchema["event_data_profiles"]> | undefined,
): Promise<void> {
  if (!source) return;
  const target = await db
    .selectFrom("event_data_profiles")
    .selectAll()
    .where("event_id", "=", targetEventId)
    .executeTakeFirst();
  if (!target) {
    await db
      .insertInto("event_data_profiles")
      .values({ ...source, event_id: targetEventId })
      .execute();
    return;
  }
  if (
    target.schema_version !== source.schema_version ||
    target.profile_json !== source.profile_json
  ) {
    throw new Error("Conflicting Event DataProfiles must be reconciled before merge");
  }
}

function connectedComponents(events: EventRow[]): EventRow[][] {
  const remaining = new Set(events.map((event) => event.id));
  const byId = new Map(events.map((event) => [event.id, event]));
  const groups: EventRow[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as string;
    remaining.delete(first);
    const queue = [first];
    const group: EventRow[] = [];
    while (queue.length) {
      const id = queue.shift();
      if (!id) continue;
      const event = byId.get(id);
      if (!event) continue;
      group.push(event);
      for (const candidateId of remaining) {
        const candidate = byId.get(candidateId);
        if (
          candidate &&
          candidate.content_scope === event.content_scope &&
          belongsToEvent(
            { title: candidate.title, publishedAt: candidate.happened_at },
            { title: event.title, happenedAt: event.happened_at },
          )
        ) {
          remaining.delete(candidateId);
          queue.push(candidateId);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function compareTargets(
  left: EventRow,
  right: EventRow,
  evidence: Map<string, { count: number; sourceIds: Set<string> }>,
): number {
  const statusWeight = (event: EventRow) => (event.status === "published" ? 2 : 0);
  const manualWeight = (event: EventRow) => event.manual_override;
  const score = (event: EventRow) =>
    statusWeight(event) * 10_000 +
    manualWeight(event) * 5_000 +
    (evidence.get(event.id)?.sourceIds.size ?? 0) * 100 +
    (evidence.get(event.id)?.count ?? 0);
  return score(right) - score(left) || left.happened_at.localeCompare(right.happened_at);
}

function toCandidateEvent(
  event: EventRow,
  evidence: Map<string, { count: number; sourceIds: Set<string> }>,
) {
  const eventEvidence = evidence.get(event.id);
  return {
    id: event.id,
    title: event.title,
    status: event.status,
    happenedAt: event.happened_at,
    evidenceCount: eventEvidence?.count ?? 0,
    independentSources: eventEvidence?.sourceIds.size ?? 0,
  };
}
