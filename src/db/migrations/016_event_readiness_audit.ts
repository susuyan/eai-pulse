import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("events")
    .addColumn("readiness_blockers_json", "text", (column) => column.notNull().defaultTo("[]"))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("events").dropColumn("readiness_blockers_json").execute();
}
