import type { Kysely } from "kysely";
import { embodiedTracks } from "../../catalog/embodied-data/tracks.js";
import type { DomainObjectRecord, Repository } from "../../db/repository.js";
import type { DatabaseSchema } from "../../db/types.js";
import {
  type EmbodiedPipelineStage,
  EmbodiedPipelineStageSchema,
  EventDataProfileSchema,
} from "../../domain/embodied-data.js";
import {
  type CollectionMethodProfile,
  CollectionMethodProfileSchema,
  type DatasetProfile,
  DatasetProfileSchema,
  type PeerCompanyProfile,
  PeerCompanyProfileSchema,
  type StandardProfile,
  StandardProfileSchema,
} from "../../domain/embodied-data-objects.js";
import type { PublicEvent } from "../../domain/types.js";
import type {
  EventTrack,
  PublicCollectionMethod,
  PublicDataset,
  PublicEmbodiedEvent,
  PublicEventRelation,
  PublicPeer,
  PublicPipelineStage,
  PublicStandard,
} from "./dto.js";

const PIPELINE_ORDER: EmbodiedPipelineStage[] = [
  "demand-definition",
  "acquisition-route",
  "multimodal-capture",
  "production-operations",
  "data-engineering-standards",
  "quality-training-feedback",
];

const orderBySlug = new Map(PIPELINE_ORDER.map((slug, index) => [slug, index]));

export interface PublicEventRelations {
  tracks: EventTrack[];
  datasets: PublicEventRelation[];
  standards: PublicEventRelation[];
  collectionMethods: PublicEventRelation[];
  peers: PublicEventRelation[];
}

export interface EmbodiedPublicData {
  events: PublicEmbodiedEvent[];
  pipelineStages: PublicPipelineStage[];
  datasets: PublicDataset[];
  standards: PublicStandard[];
  collectionMethods: PublicCollectionMethod[];
  peers: PublicPeer[];
}

interface PublicDataInput {
  events: PublicEvent[];
  tracks: Array<{
    slug: string;
    name: string;
    description: string;
    color: string;
    icon: string;
  }>;
  actors: Array<{
    id: string;
    slug: string;
    actor_type: string;
    region: string;
    website_url: string;
  }>;
  eventTracks: ReadonlyMap<string, EventTrack[]>;
}

export async function buildEmbodiedPublicData(
  db: Kysely<DatabaseSchema>,
  repository: Repository,
  input: PublicDataInput,
): Promise<EmbodiedPublicData> {
  const eventIds = input.events.map((event) => event.id);
  const [profileRows, datasetRecords, standardRecords, collectionMethodRecords] = await Promise.all(
    [
      db
        .selectFrom("event_data_profiles")
        .select(["event_id", "profile_json"])
        .where("event_id", "in", eventIds)
        .execute(),
      repository.listDatasets(),
      repository.listStandards(),
      repository.listCollectionMethods(),
    ],
  );

  const [datasetLinks, standardLinks, collectionMethodLinks, capabilityEvidence] =
    await Promise.all([
      publicObjectEventLinks(db, "dataset_events", "dataset_id", eventIds),
      publicObjectEventLinks(db, "standard_events", "standard_id", eventIds),
      publicObjectEventLinks(db, "collection_method_events", "collection_method_id", eventIds),
      eventIds.length
        ? db
            .selectFrom("actor_capability_evidence")
            .innerJoin(
              "actor_data_capabilities",
              "actor_data_capabilities.id",
              "actor_capability_evidence.capability_id",
            )
            .innerJoin("actors", "actors.id", "actor_data_capabilities.actor_id")
            .innerJoin("events", "events.id", "actor_capability_evidence.event_id")
            .select([
              "actors.id as actorId",
              "actors.slug as actorSlug",
              "actors.name as actorName",
              "actor_data_capabilities.capability_key as capabilityKey",
              "actor_capability_evidence.event_id as eventId",
              "actor_capability_evidence.evidence_role as role",
              "events.slug as eventSlug",
              "events.title as eventTitle",
            ])
            .where("actor_capability_evidence.event_id", "in", eventIds)
            .where("actors.content_scope", "=", "embodied-data")
            .where("events.content_scope", "=", "embodied-data")
            .where("events.status", "=", "published")
            .execute()
        : Promise.resolve([]),
    ]);

  const profiles = new Map(
    profileRows.map((row) => [
      row.event_id,
      EventDataProfileSchema.parse(JSON.parse(row.profile_json)),
    ]),
  );
  const eventById = new Map(input.events.map((event) => [event.id, event]));
  const datasetById = new Map(datasetRecords.map((record) => [record.id, record]));
  const standardById = new Map(standardRecords.map((record) => [record.id, record]));
  const collectionMethodById = new Map(
    collectionMethodRecords.map((record) => [record.id, record]),
  );

  const datasetRelations = relationsByEvent(datasetLinks, datasetById);
  const standardRelations = relationsByEvent(standardLinks, standardById);
  const collectionMethodRelations = relationsByEvent(collectionMethodLinks, collectionMethodById);
  const peerRelations = new Map<string, PublicEventRelation[]>();
  const evidenceByActorAndCapability = new Map<string, PublicEventRelation[]>();
  for (const evidence of capabilityEvidence) {
    pushRelation(peerRelations, evidence.eventId, {
      slug: evidence.actorSlug,
      title: evidence.actorName,
      role: evidence.role,
    });
    pushRelation(evidenceByActorAndCapability, `${evidence.actorId}:${evidence.capabilityKey}`, {
      slug: evidence.eventSlug,
      title: evidence.eventTitle,
      role: evidence.role,
    });
  }

  const peers = (
    await Promise.all(
      input.actors.map(async (actor) => {
        const profile = await repository.getPeerCompanyProfile(actor.id);
        if (!profile) return null;
        const evidence = new Map(
          profile.capabilities.map((capability) => [
            capability.capabilityKey,
            evidenceByActorAndCapability.get(`${actor.id}:${capability.capabilityKey}`) ?? [],
          ]),
        );
        return projectPublicPeer(
          profile,
          {
            actorType: actor.actor_type,
            region: actor.region,
            websiteUrl: actor.website_url,
          },
          evidence,
        );
      }),
    )
  ).filter((peer): peer is PublicPeer => peer !== null);

  const events = input.events.map((event) => {
    const profile = profiles.get(event.id);
    if (!profile)
      throw new Error(`Published event is missing an embodied data profile: ${event.slug}`);
    return projectPublicEmbodiedEvent(event, profile, {
      tracks: input.eventTracks.get(event.id) ?? [],
      datasets: datasetRelations.get(event.id) ?? [],
      standards: standardRelations.get(event.id) ?? [],
      collectionMethods: collectionMethodRelations.get(event.id) ?? [],
      peers: peerRelations.get(event.id) ?? [],
    });
  });

  return {
    events,
    pipelineStages: projectPipelineStages(input.tracks, events, peers),
    datasets: datasetRecords.map((record) =>
      projectPublicDataset(record, objectRelatedEvents(datasetLinks, record.id, eventById)),
    ),
    standards: standardRecords.map((record) =>
      projectPublicStandard(record, objectRelatedEvents(standardLinks, record.id, eventById)),
    ),
    collectionMethods: collectionMethodRecords.map((record) =>
      projectPublicCollectionMethod(
        record,
        objectRelatedEvents(collectionMethodLinks, record.id, eventById),
      ),
    ),
    peers,
  };
}

export function projectPublicEmbodiedEvent(
  event: PublicEvent,
  dataProfile: unknown,
  relations: PublicEventRelations,
): PublicEmbodiedEvent {
  const parsedProfile = EventDataProfileSchema.parse(dataProfile);
  const { id: _id, ...publicEvent } = event;
  return {
    ...publicEvent,
    evidence: [...event.evidence].sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
        left.role.localeCompare(right.role),
    ),
    pipelineStages: sortPipelineStages(parsedProfile.pipelineStages),
    dataProfile: parsedProfile,
    tracks: [...relations.tracks].sort((left, right) => left.orderIndex - right.orderIndex),
    datasets: sortRelations(relations.datasets),
    standards: sortRelations(relations.standards),
    collectionMethods: sortRelations(relations.collectionMethods),
    peers: sortRelations(relations.peers),
  };
}

export function projectPublicDataset(
  record: DomainObjectRecord<DatasetProfile>,
  relatedEvents: PublicEventRelation[],
): PublicDataset {
  return {
    slug: record.slug,
    ...DatasetProfileSchema.parse(record.profile),
    relatedEvents: sortRelations(relatedEvents),
  };
}

export function projectPublicStandard(
  record: DomainObjectRecord<StandardProfile>,
  relatedEvents: PublicEventRelation[],
): PublicStandard {
  return {
    slug: record.slug,
    ...StandardProfileSchema.parse(record.profile),
    relatedEvents: sortRelations(relatedEvents),
  };
}

export function projectPublicCollectionMethod(
  record: DomainObjectRecord<CollectionMethodProfile>,
  relatedEvents: PublicEventRelation[],
): PublicCollectionMethod {
  return {
    slug: record.slug,
    ...CollectionMethodProfileSchema.parse(record.profile),
    relatedEvents: sortRelations(relatedEvents),
  };
}

export function projectPublicPeer(
  value: PeerCompanyProfile,
  actor: { actorType: string; region: string; websiteUrl: string },
  evidenceByCapability: ReadonlyMap<string, PublicEventRelation[]>,
): PublicPeer {
  const parsed = PeerCompanyProfileSchema.parse(value);
  if (parsed.contentScope !== "embodied-data") {
    throw new Error(`Cannot publish legacy peer: ${parsed.actorSlug}`);
  }
  return {
    slug: parsed.actorSlug,
    name: parsed.actorName,
    actorType: actor.actorType,
    region: actor.region,
    websiteUrl: actor.websiteUrl,
    capabilities: parsed.capabilities.map((capability) => ({
      ...capability,
      pipelineStages: sortPipelineStages(capability.pipelineStages),
      evidence: sortRelations(evidenceByCapability.get(capability.capabilityKey) ?? []),
    })),
  };
}

export function projectPipelineStages(
  tracks: Array<{
    slug: string;
    name: string;
    description: string;
    color: string;
    icon: string;
  }>,
  events: PublicEmbodiedEvent[] = [],
  peers: PublicPeer[] = [],
): PublicPipelineStage[] {
  return tracks
    .map((track) => {
      const slug = EmbodiedPipelineStageSchema.parse(track.slug);
      const catalog = embodiedTracks.find((item) => item.slug === slug);
      if (!catalog) throw new Error(`Missing embodied pipeline catalog entry: ${slug}`);
      const stageEvents = events
        .filter((event) => event.pipelineStages.includes(slug))
        .sort((left, right) => Date.parse(right.happenedAt) - Date.parse(left.happenedAt));
      const milestones = stageEvents.map((event) => ({
        eventSlug: event.slug,
        title: event.title,
        happenedAt: event.happenedAt,
        deliveryImpact: event.dataProfile.deliveryImpact,
        evidenceStatus: event.dataProfile.evidenceStatus,
        evidence: event.evidence,
      }));
      return {
        ...track,
        slug,
        nameEn: catalog.nameEn,
        descriptionEn: catalog.descriptionEn,
        order: orderBySlug.get(slug) ?? 99,
        milestones,
        peerComparisons: peers
          .flatMap((peer) =>
            peer.capabilities
              .filter((capability) => capability.pipelineStages.includes(slug))
              .map((capability) => ({
                peerSlug: peer.slug,
                peerName: peer.name,
                claimText: capability.claimText,
                verificationStatus: capability.verificationStatus,
                sourceUrl: capability.sourceUrl,
              })),
          )
          .sort(
            (left, right) =>
              left.peerName.localeCompare(right.peerName) ||
              left.claimText.localeCompare(right.claimText),
          ),
        counterEvidence: milestones.filter((item) =>
          ["conflicting", "unknown"].includes(item.evidenceStatus),
        ),
        nextSignals: stageEvents.map((event) => ({
          eventSlug: event.slug,
          eventTitle: event.title,
          signal: event.futureOutlook,
        })),
      };
    })
    .sort((left, right) => left.order - right.order);
}

function sortPipelineStages(stages: EmbodiedPipelineStage[]): EmbodiedPipelineStage[] {
  return [...stages].sort(
    (left, right) => (orderBySlug.get(left) ?? 99) - (orderBySlug.get(right) ?? 99),
  );
}

function sortRelations(relations: PublicEventRelation[]): PublicEventRelation[] {
  return [...relations].sort(
    (left, right) => left.slug.localeCompare(right.slug) || left.role.localeCompare(right.role),
  );
}

interface ObjectEventLink {
  objectId: string;
  eventId: string;
  role: string;
}

async function publicObjectEventLinks(
  db: Kysely<DatabaseSchema>,
  table: "dataset_events" | "standard_events" | "collection_method_events",
  objectIdColumn: "dataset_id" | "standard_id" | "collection_method_id",
  eventIds: string[],
): Promise<ObjectEventLink[]> {
  if (!eventIds.length) return [];
  if (table === "dataset_events" && objectIdColumn === "dataset_id") {
    return db
      .selectFrom("dataset_events")
      .select(["dataset_id as objectId", "event_id as eventId", "relation_role as role"])
      .where("event_id", "in", eventIds)
      .execute();
  }
  if (table === "standard_events" && objectIdColumn === "standard_id") {
    return db
      .selectFrom("standard_events")
      .select(["standard_id as objectId", "event_id as eventId", "relation_role as role"])
      .where("event_id", "in", eventIds)
      .execute();
  }
  if (table === "collection_method_events" && objectIdColumn === "collection_method_id") {
    return db
      .selectFrom("collection_method_events")
      .select(["collection_method_id as objectId", "event_id as eventId", "relation_role as role"])
      .where("event_id", "in", eventIds)
      .execute();
  }
  throw new Error(`Unsupported public relation table: ${table}.${objectIdColumn}`);
}

function relationsByEvent<T extends { slug: string; profile: { name: string } }>(
  links: ObjectEventLink[],
  objects: ReadonlyMap<string, T>,
): Map<string, PublicEventRelation[]> {
  const result = new Map<string, PublicEventRelation[]>();
  for (const link of links) {
    const object = objects.get(link.objectId);
    if (!object) continue;
    pushRelation(result, link.eventId, {
      slug: object.slug,
      title: object.profile.name,
      role: link.role,
    });
  }
  return result;
}

function objectRelatedEvents(
  links: ObjectEventLink[],
  objectId: string,
  events: ReadonlyMap<string, PublicEvent>,
): PublicEventRelation[] {
  return links
    .filter((link) => link.objectId === objectId)
    .flatMap((link) => {
      const event = events.get(link.eventId);
      return event ? [{ slug: event.slug, title: event.title, role: link.role }] : [];
    });
}

function pushRelation(
  target: Map<string, PublicEventRelation[]>,
  key: string,
  relation: PublicEventRelation,
): void {
  const values = target.get(key) ?? [];
  values.push(relation);
  target.set(key, values);
}
