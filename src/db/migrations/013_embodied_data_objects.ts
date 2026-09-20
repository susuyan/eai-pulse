import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("datasets")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("slug", "varchar(150)", (column) => column.notNull().unique())
    .addColumn("profile_json", "text", (column) => column.notNull())
    .addColumn("schema_version", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("created_at", "varchar(40)", (column) => column.notNull())
    .addColumn("updated_at", "varchar(40)", (column) => column.notNull())
    .execute();
  await db.schema
    .createTable("dataset_events")
    .addColumn("dataset_id", "varchar(36)", (column) =>
      column.notNull().references("datasets.id").onDelete("cascade"),
    )
    .addColumn("event_id", "varchar(36)", (column) =>
      column.notNull().references("events.id").onDelete("cascade"),
    )
    .addColumn("relation_role", "varchar(30)", (column) => column.notNull())
    .addColumn("created_at", "varchar(40)", (column) => column.notNull())
    .addPrimaryKeyConstraint("dataset_events_pk", ["dataset_id", "event_id", "relation_role"])
    .execute();

  await db.schema
    .createTable("standards")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("slug", "varchar(150)", (column) => column.notNull().unique())
    .addColumn("profile_json", "text", (column) => column.notNull())
    .addColumn("schema_version", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("created_at", "varchar(40)", (column) => column.notNull())
    .addColumn("updated_at", "varchar(40)", (column) => column.notNull())
    .execute();
  await db.schema
    .createTable("standard_events")
    .addColumn("standard_id", "varchar(36)", (column) =>
      column.notNull().references("standards.id").onDelete("cascade"),
    )
    .addColumn("event_id", "varchar(36)", (column) =>
      column.notNull().references("events.id").onDelete("cascade"),
    )
    .addColumn("relation_role", "varchar(30)", (column) => column.notNull())
    .addColumn("created_at", "varchar(40)", (column) => column.notNull())
    .addPrimaryKeyConstraint("standard_events_pk", ["standard_id", "event_id", "relation_role"])
    .execute();

  await db.schema
    .createTable("collection_methods")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("slug", "varchar(150)", (column) => column.notNull().unique())
    .addColumn("profile_json", "text", (column) => column.notNull())
    .addColumn("schema_version", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("created_at", "varchar(40)", (column) => column.notNull())
    .addColumn("updated_at", "varchar(40)", (column) => column.notNull())
    .execute();
  await db.schema
    .createTable("collection_method_events")
    .addColumn("collection_method_id", "varchar(36)", (column) =>
      column.notNull().references("collection_methods.id").onDelete("cascade"),
    )
    .addColumn("event_id", "varchar(36)", (column) =>
      column.notNull().references("events.id").onDelete("cascade"),
    )
    .addColumn("relation_role", "varchar(30)", (column) => column.notNull())
    .addColumn("created_at", "varchar(40)", (column) => column.notNull())
    .addPrimaryKeyConstraint("collection_method_events_pk", [
      "collection_method_id",
      "event_id",
      "relation_role",
    ])
    .execute();

  await db.schema
    .createTable("actor_data_capabilities")
    .addColumn("id", "varchar(36)", (column) => column.primaryKey())
    .addColumn("actor_id", "varchar(36)", (column) =>
      column.notNull().references("actors.id").onDelete("cascade"),
    )
    .addColumn("capability_key", "varchar(100)", (column) => column.notNull())
    .addColumn("profile_json", "text", (column) => column.notNull())
    .addColumn("schema_version", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("created_at", "varchar(40)", (column) => column.notNull())
    .addColumn("updated_at", "varchar(40)", (column) => column.notNull())
    .addUniqueConstraint("actor_data_capabilities_actor_key_unique", ["actor_id", "capability_key"])
    .execute();
  await db.schema
    .createTable("actor_capability_evidence")
    .addColumn("capability_id", "varchar(36)", (column) =>
      column.notNull().references("actor_data_capabilities.id").onDelete("cascade"),
    )
    .addColumn("event_id", "varchar(36)", (column) =>
      column.notNull().references("events.id").onDelete("cascade"),
    )
    .addColumn("evidence_role", "varchar(30)", (column) => column.notNull())
    .addColumn("created_at", "varchar(40)", (column) => column.notNull())
    .addPrimaryKeyConstraint("actor_capability_evidence_pk", [
      "capability_id",
      "event_id",
      "evidence_role",
    ])
    .execute();

  await db.schema
    .createIndex("dataset_events_event_idx")
    .on("dataset_events")
    .column("event_id")
    .execute();
  await db.schema
    .createIndex("standard_events_event_idx")
    .on("standard_events")
    .column("event_id")
    .execute();
  await db.schema
    .createIndex("collection_method_events_event_idx")
    .on("collection_method_events")
    .column("event_id")
    .execute();
  await db.schema
    .createIndex("actor_capability_evidence_event_idx")
    .on("actor_capability_evidence")
    .column("event_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("actor_capability_evidence").ifExists().execute();
  await db.schema.dropTable("actor_data_capabilities").ifExists().execute();
  await db.schema.dropTable("collection_method_events").ifExists().execute();
  await db.schema.dropTable("collection_methods").ifExists().execute();
  await db.schema.dropTable("standard_events").ifExists().execute();
  await db.schema.dropTable("standards").ifExists().execute();
  await db.schema.dropTable("dataset_events").ifExists().execute();
  await db.schema.dropTable("datasets").ifExists().execute();
}
