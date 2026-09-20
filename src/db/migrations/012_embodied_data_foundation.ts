import type { Kysely } from "kysely";

const scopedTables = ["sources", "signals", "events", "actors"] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of scopedTables) {
    await db.schema
      .alterTable(table)
      .addColumn("content_scope", "varchar(40)", (column) =>
        column.notNull().defaultTo("legacy-ai"),
      )
      .execute();
  }

  await db.schema
    .createTable("event_data_profiles")
    .addColumn("event_id", "varchar(36)", (column) =>
      column.primaryKey().references("events.id").onDelete("cascade"),
    )
    .addColumn("profile_json", "text", (column) => column.notNull())
    .addColumn("schema_version", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("created_at", "varchar(40)", (column) => column.notNull())
    .addColumn("updated_at", "varchar(40)", (column) => column.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("event_data_profiles").ifExists().execute();
  for (const table of [...scopedTables].reverse()) {
    await db.schema.alterTable(table).dropColumn("content_scope").execute();
  }
}
