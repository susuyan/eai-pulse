import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("evaluation_runs")
    .addColumn("evaluation_as_of", "varchar(40)")
    .execute();
  await db.schema.alterTable("evaluation_runs").addColumn("gate_mode", "varchar(20)").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("evaluation_runs").dropColumn("gate_mode").execute();
  await db.schema.alterTable("evaluation_runs").dropColumn("evaluation_as_of").execute();
}
