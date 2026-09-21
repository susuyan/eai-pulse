import type { Kysely } from "kysely";
import { Repository } from "../db/repository.js";
import type { DatabaseSchema } from "../db/types.js";
import { observationEligibility } from "./observation.js";

export interface OperationState {
  allowed: boolean;
  reason: string | null;
}

export interface SourceOperations {
  activate: OperationState & {
    latestStatus: string | null;
    healthyChecks: number;
    observationDays: number;
  };
  collect: OperationState;
  observe: OperationState;
  quarantine: OperationState;
}

export async function sourceOperationReadiness(
  db: Kysely<DatabaseSchema>,
): Promise<Map<string, SourceOperations>> {
  const repository = new Repository(db);
  const [sources, checks, observation] = await Promise.all([
    repository.listSources(),
    db
      .selectFrom("source_checks")
      .select(["source_id", "status", "finished_at"])
      .orderBy("finished_at", "desc")
      .execute(),
    observationEligibility(db),
  ]);
  const checksBySource = new Map<string, typeof checks>();
  for (const check of checks) {
    const group = checksBySource.get(check.source_id) ?? [];
    group.push(check);
    checksBySource.set(check.source_id, group);
  }
  const observationBySource = new Map(observation.map((item) => [item.sourceId, item]));
  return new Map(
    sources.map((source) => {
      const activation = activationQualification(checksBySource.get(source.id) ?? []);
      const activationLifecycle = ["shadow", "degraded"].includes(source.lifecycle_status);
      const observationState = observationBySource.get(source.id);
      return [
        source.id,
        {
          activate: {
            ...activation,
            allowed: activation.allowed && activationLifecycle,
            reason: activationLifecycle ? activation.reason : "lifecycle_not_activatable",
          },
          collect: {
            allowed: ["shadow", "active", "degraded"].includes(source.lifecycle_status),
            reason: ["shadow", "active", "degraded"].includes(source.lifecycle_status)
              ? null
              : `lifecycle_${source.lifecycle_status}`,
          },
          observe: {
            allowed:
              observationState?.eligible === true ||
              (source.lifecycle_status === "shadow" && source.observation_enabled === 1),
            reason:
              source.observation_enabled === 1
                ? null
                : (observationState?.reason ?? "lifecycle_not_shadow"),
          },
          quarantine: {
            allowed: ["shadow", "active", "degraded"].includes(source.lifecycle_status),
            reason: ["shadow", "active", "degraded"].includes(source.lifecycle_status)
              ? null
              : `lifecycle_${source.lifecycle_status}`,
          },
        },
      ];
    }),
  );
}

export function activationQualification(
  checks: Array<{ status: string; finished_at: string }>,
): SourceOperations["activate"] {
  const healthy = checks.filter((check) => check.status === "healthy");
  const oldestHealthy = healthy.at(-1);
  const observationDays = oldestHealthy
    ? Math.max(0, (Date.now() - Date.parse(oldestHealthy.finished_at)) / 86_400_000)
    : 0;
  const latestStatus = checks[0]?.status ?? null;
  const allowed = latestStatus === "healthy" && healthy.length >= 20 && observationDays >= 7;
  return {
    allowed,
    latestStatus,
    healthyChecks: healthy.length,
    observationDays: Math.floor(observationDays),
    reason: allowed
      ? null
      : latestStatus !== "healthy"
        ? "latest_check_not_healthy"
        : healthy.length < 20
          ? "healthy_checks_below_20"
          : "observation_window_below_7_days",
  };
}
