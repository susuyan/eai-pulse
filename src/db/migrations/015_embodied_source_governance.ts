import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("sources")
    .addColumn("owner", "varchar(160)", (column) => column.notNull().defaultTo("Unknown owner"))
    .execute();
  await db.schema
    .alterTable("sources")
    .addColumn("robots_policy", "text", (column) => column.notNull().defaultTo("Review required"))
    .execute();
  await db.schema
    .alterTable("sources")
    .addColumn("freshness_slo_hours", "integer", (column) => column.notNull().defaultTo(168))
    .execute();
  await db.schema
    .alterTable("sources")
    .addColumn("adapter_version", "varchar(30)", (column) => column.notNull().defaultTo("1"))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const column of ["adapter_version", "freshness_slo_hours", "robots_policy", "owner"]) {
    await db.schema.alterTable("sources").dropColumn(column).execute();
  }
}
