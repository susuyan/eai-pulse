import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("sources")
    .addColumn("map_status", "varchar(30)", (column) => column.notNull().defaultTo("pending"))
    .execute();
  await db.schema
    .alterTable("sources")
    .addColumn("pipeline_stages_json", "text", (column) => column.notNull().defaultTo("[]"))
    .execute();
  await db.schema
    .alterTable("sources")
    .addColumn("substitute_for_json", "text", (column) => column.notNull().defaultTo("[]"))
    .execute();
  await db.schema
    .alterTable("sources")
    .addColumn("restriction_note", "text", (column) => column.notNull().defaultTo(""))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const column of [
    "restriction_note",
    "substitute_for_json",
    "pipeline_stages_json",
    "map_status",
  ]) {
    await db.schema.alterTable("sources").dropColumn(column).execute();
  }
}
