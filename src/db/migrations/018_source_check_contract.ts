import type { Kysely } from "kysely";

export async function up<DB>(db: Kysely<DB>): Promise<void> {
  await db.schema
    .alterTable("source_checks")
    .addColumn("contract_fingerprint", "varchar(64)")
    .execute();
}

export async function down<DB>(db: Kysely<DB>): Promise<void> {
  await db.schema.alterTable("source_checks").dropColumn("contract_fingerprint").execute();
}
