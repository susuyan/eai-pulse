import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { createSafeFetcher, FetchError } from "../collectors/fetcher.js";
import { getAdapter } from "../collectors/index.js";
import { createDefaultRateLimiter, RateLimiter } from "../collectors/rate-limiter.js";
import type { CollectContext, FetchResult } from "../collectors/types.js";
import type { AppConfig } from "../config/env.js";
import { Repository } from "../db/repository.js";
import type { DatabaseSchema, NewSourceCheckRow, SourceRow } from "../db/types.js";
import { sourceRowContractFingerprint } from "../domain/source-contract.js";
import type { CollectedSignal, SourceDescriptor } from "../domain/types.js";
import { canonicalizeUrl } from "../domain/url.js";
import { concurrentMap } from "./collect.js";
import { scoreBatch } from "./quality.js";

export type SourceCheckStatus = "healthy" | "degraded" | "failed" | "skipped";

export interface SourceCheckResult {
  sourceId: string;
  slug: string;
  status: SourceCheckStatus;
  accessStatus: string;
  fetchStatus: string;
  parseStatus: string;
  schemaStatus: string;
  policyStatus: string;
  itemCount: number;
  latestItemAt: string | null;
  duplicateRatio: number;
  qualityScore: number;
  errorType: string | null;
  errorCode: string | null;
  repairAction: string;
  proxyHint: string;
  proxyUsed: boolean;
  retentionDecision: string;
  recommendedLifecycle: string;
  durationMs: number;
}

export interface SourceAuditReport {
  jobId: string;
  startedAt: string;
  finishedAt: string;
  total: number;
  healthy: number;
  degraded: number;
  failed: number;
  skipped: number;
  accessible: number;
  fetched: number;
  withContent: number;
  results: SourceCheckResult[];
}

interface AuditOptions {
  sourceId?: string;
  sourceIds?: string[];
  concurrency?: number;
}

interface AuditDependencies {
  fetcher?: ReturnType<typeof createSafeFetcher>;
  adapterFor?: typeof getAdapter;
  rateLimiter?: RateLimiter;
}

interface FetchDiagnostics {
  attempts: number;
  responseBytes: number;
  httpStatus: number | null;
  finalUrl: string | null;
  contentType: string | null;
  proxyUsed: boolean;
}

export async function auditSources(
  db: Kysely<DatabaseSchema>,
  config: AppConfig,
  options: AuditOptions = {},
  dependencies: AuditDependencies = {},
): Promise<SourceAuditReport> {
  const repository = new Repository(db);
  const startedAt = new Date().toISOString();
  const selectedIds = options.sourceIds ?? (options.sourceId ? [options.sourceId] : undefined);
  let sources: SourceRow[];
  if (selectedIds) {
    const ids = [...new Set(selectedIds)];
    const rows = ids.length
      ? await db.selectFrom("sources").selectAll().where("id", "in", ids).execute()
      : [];
    const sourcesById = new Map(rows.map((source) => [source.id, source]));
    sources = ids.map((id) => {
      const source = sourcesById.get(id);
      if (!source) throw new Error(`Source not found: ${id}`);
      return source;
    });
  } else {
    sources = await repository.listSources();
  }

  const auditTargets = {
    targetSourceIds: sources.map((source) => source.id),
    expectedSourceCount: sources.length,
  };
  const jobId = await repository.startJob(
    "source-audit",
    selectedIds && sources.length === 1 ? (sources[0]?.id ?? null) : null,
    { ...auditTargets, auditComplete: false },
  );
  let results: SourceCheckResult[] = [];
  const fatalErrors: unknown[] = [];
  try {
    const runtimeDependencies: AuditDependencies = {
      ...dependencies,
      fetcher: dependencies.fetcher ?? createSafeFetcher(config),
      rateLimiter: dependencies.rateLimiter ?? createDefaultRateLimiter(),
    };
    const outcomes = await concurrentMap(
      sources,
      Math.min(options.concurrency ?? config.COLLECTOR_CONCURRENCY, 8),
      async (source) => {
        try {
          return {
            result: await auditOneSource(repository, config, source, jobId, runtimeDependencies),
          };
        } catch (error) {
          // Drain the cohort before finalizing a job with incomplete persisted evidence.
          return { error };
        }
      },
    );
    results = outcomes.flatMap((outcome) => (outcome.result ? [outcome.result] : []));
    const failures = outcomes.filter((outcome) => "error" in outcome);
    if (failures.length) {
      throw new AggregateError(
        failures.map((outcome) => outcome.error),
        "Source audit incomplete",
      );
    }
  } catch (error) {
    fatalErrors.push(error);
  } finally {
    const errors = results
      .filter((result) => result.status === "failed")
      .map((result) => `${result.slug}:${result.errorCode ?? result.errorType ?? "failed"}`);
    if (fatalErrors.length) errors.push("AUDIT_INCOMPLETE");
    try {
      await repository.finishJob(jobId, {
        collected: results.length,
        created: results.filter((result) => result.status === "healthy").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        errors,
        details: { ...auditTargets, auditComplete: fatalErrors.length === 0 },
      });
    } catch (error) {
      fatalErrors.push(error);
    }
  }

  if (fatalErrors.length === 1) throw fatalErrors[0];
  if (fatalErrors.length > 1) {
    throw new AggregateError(fatalErrors, "Source audit and finalization failed");
  }

  return summarizeAudit(jobId, startedAt, results);
}

async function auditOneSource(
  repository: Repository,
  config: AppConfig,
  source: SourceRow,
  jobId: string,
  dependencies: AuditDependencies,
): Promise<SourceCheckResult> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const diagnostics: FetchDiagnostics = {
    attempts: 0,
    responseBytes: 0,
    httpStatus: null,
    finalUrl: null,
    contentType: null,
    proxyUsed: false,
  };

  if (source.acquisition === "social" || source.maintenance_status === "restricted") {
    return persistCheck(repository, source, jobId, startedAt, startedMs, diagnostics, {
      status: "skipped",
      accessStatus: "not_checked",
      fetchStatus: "policy_skipped",
      parseStatus: "not_applicable",
      schemaStatus: "not_applicable",
      policyStatus: "restricted",
      items: [],
      qualityScore: 0,
      errorType: "policy",
      errorCode: "RESTRICTED_SOURCE",
      errorSummary: "Source requires a platform-approved API or explicit manual workflow.",
      repairAction: "configure_approved_access",
      proxyHint: "not_applicable",
      retentionDecision: "keep_restricted",
      recommendedLifecycle: source.lifecycle_status === "retired" ? "retired" : "shadow",
    });
  }

  let descriptor: SourceDescriptor;
  try {
    descriptor = repository.toSourceDescriptor(source);
  } catch (error) {
    return persistCheck(repository, source, jobId, startedAt, startedMs, diagnostics, {
      status: "failed",
      accessStatus: "not_checked",
      fetchStatus: "not_started",
      parseStatus: "not_started",
      schemaStatus: "invalid",
      policyStatus: "unknown",
      items: [],
      qualityScore: 0,
      ...diagnose(error, source, "fix_source_config"),
    });
  }

  const safeFetch = dependencies.fetcher ?? createSafeFetcher(config);
  const rateLimiter = dependencies.rateLimiter ?? createDefaultRateLimiter();
  const fetchText: CollectContext["fetchText"] = async (url, headers = {}, constraints = {}) => {
    const result = await safeFetch(url, headers, {
      timeoutMs: Math.min(source.timeout_ms, 30_000),
      maxRetries: Math.min(source.max_retries, 1),
      baseBackoffMs: source.base_backoff_ms,
      ...constraints,
      dispatchRequest: (requestUrl, validate, start) =>
        rateLimiter.dispatch(
          RateLimiter.domainFromUrl(requestUrl),
          source.rate_limit_per_minute,
          source.id,
          validate,
          start,
        ),
    });
    recordFetch(diagnostics, result);
    return result;
  };

  if (source.adapter === "manual" || source.acquisition === "manual") {
    try {
      await fetchText(descriptor.config.url);
      return persistCheck(repository, source, jobId, startedAt, startedMs, diagnostics, {
        status: "skipped",
        accessStatus: "reachable",
        fetchStatus: "succeeded",
        parseStatus: "unsupported",
        schemaStatus: "not_applicable",
        policyStatus: "manual_review",
        items: [],
        qualityScore: 0,
        errorType: null,
        errorCode: null,
        errorSummary: null,
        repairAction: "configure_stable_adapter",
        proxyHint: "not_required",
        retentionDecision: "keep_manual",
        recommendedLifecycle: source.lifecycle_status === "retired" ? "retired" : "shadow",
      });
    } catch (error) {
      if (error instanceof FetchError && error.status) diagnostics.httpStatus = error.status;
      return persistCheck(repository, source, jobId, startedAt, startedMs, diagnostics, {
        status: "failed",
        accessStatus: diagnostics.httpStatus ? "reachable" : "unreachable",
        fetchStatus: "failed",
        parseStatus: "not_started",
        schemaStatus: "not_applicable",
        policyStatus: "manual_review",
        items: [],
        qualityScore: 0,
        ...diagnose(error, source, "verify_or_replace_endpoint"),
      });
    }
  }

  try {
    const adapter = (dependencies.adapterFor ?? getAdapter)(source.adapter);
    const extracted = await adapter.collect(descriptor, { config, fetchText });
    const validation = validateItems(extracted);
    const items = validation.valid;
    const duplicate = duplicateStats(items);
    const quality = scoreBatch(items, descriptor).summary.avgScore;
    const status: SourceCheckStatus =
      extracted.length > 0 && items.length === 0
        ? "failed"
        : items.length === 0 || quality < 35 || duplicate.ratio > 0.8 || validation.invalid > 0
          ? "degraded"
          : "healthy";
    return persistCheck(repository, source, jobId, startedAt, startedMs, diagnostics, {
      status,
      accessStatus: diagnostics.httpStatus ? "reachable" : "not_observed",
      fetchStatus: diagnostics.httpStatus === 304 ? "not_modified" : "succeeded",
      parseStatus: extracted.length ? "succeeded" : "empty",
      schemaStatus:
        validation.invalid === 0
          ? items.length
            ? "valid"
            : "empty"
          : items.length
            ? "partial"
            : "invalid",
      policyStatus: "allowed_metadata",
      items,
      qualityScore: quality,
      errorType: validation.invalid ? "contract" : items.length ? null : "content",
      errorCode: validation.invalid ? "INVALID_ITEMS" : items.length ? null : "EMPTY_RESULT",
      errorSummary: validation.invalid
        ? `${validation.invalid}/${extracted.length} extracted items failed URL, title, or date validation.`
        : items.length
          ? null
          : "Adapter returned no normalized items.",
      repairAction: validation.invalid
        ? "repair_item_normalization"
        : items.length
          ? "observe_in_shadow"
          : "inspect_endpoint_or_parser",
      proxyHint: "not_required",
      retentionDecision: status === "healthy" ? "keep" : "observe",
      recommendedLifecycle:
        status === "healthy" && source.lifecycle_status === "active"
          ? "active"
          : source.lifecycle_status === "retired"
            ? "retired"
            : "shadow",
    });
  } catch (error) {
    if (error instanceof FetchError && error.status) diagnostics.httpStatus = error.status;
    return persistCheck(repository, source, jobId, startedAt, startedMs, diagnostics, {
      status: "failed",
      accessStatus: diagnostics.httpStatus ? "reachable" : "unreachable",
      fetchStatus: "failed",
      parseStatus: diagnostics.httpStatus ? "failed" : "not_started",
      schemaStatus: "unknown",
      policyStatus: "allowed_metadata",
      items: [],
      qualityScore: 0,
      ...diagnose(error, source),
    });
  }
}

interface CheckDraft {
  status: SourceCheckStatus;
  accessStatus: string;
  fetchStatus: string;
  parseStatus: string;
  schemaStatus: string;
  policyStatus: string;
  items: CollectedSignal[];
  qualityScore: number;
  errorType: string | null;
  errorCode: string | null;
  errorSummary: string | null;
  repairAction: string;
  proxyHint: string;
  retentionDecision: string;
  recommendedLifecycle: string;
}

async function persistCheck(
  repository: Repository,
  source: SourceRow,
  jobId: string,
  startedAt: string,
  startedMs: number,
  diagnostics: FetchDiagnostics,
  draft: CheckDraft,
): Promise<SourceCheckResult> {
  const finishedAt = new Date().toISOString();
  const duplicate = duplicateStats(draft.items);
  const latestItemAt = latestDate(draft.items);
  let contractFingerprint: string | null = null;
  try {
    contractFingerprint = sourceRowContractFingerprint(source);
  } catch {
    // Invalid configuration must still produce a failed check, without a reusable identity.
  }
  const freshnessHours = latestItemAt
    ? Math.max(0, Math.round((Date.now() - new Date(latestItemAt).getTime()) / 3_600_000))
    : null;
  const row: NewSourceCheckRow = {
    id: randomUUID(),
    source_id: source.id,
    job_id: jobId,
    status: draft.status,
    adapter: source.adapter,
    adapter_version: source.adapter_version,
    contract_fingerprint: contractFingerprint,
    access_status: draft.accessStatus,
    fetch_status: draft.fetchStatus,
    parse_status: draft.parseStatus,
    schema_status: draft.schemaStatus,
    policy_status: draft.policyStatus,
    http_status: diagnostics.httpStatus,
    final_url: diagnostics.finalUrl,
    content_type: diagnostics.contentType,
    response_bytes: diagnostics.responseBytes,
    item_count: draft.items.length,
    duplicate_count: duplicate.count,
    duplicate_ratio_bps: Math.round(duplicate.ratio * 10_000),
    quality_score: draft.qualityScore,
    latest_item_at: latestItemAt,
    freshness_hours: freshnessHours,
    error_type: draft.errorType,
    error_code: draft.errorCode,
    error_summary: sanitizeText(draft.errorSummary),
    repair_action: draft.repairAction,
    proxy_hint: diagnostics.proxyUsed ? "required" : draft.proxyHint,
    proxy_used: diagnostics.proxyUsed ? 1 : 0,
    retention_decision: draft.retentionDecision,
    recommended_lifecycle: draft.recommendedLifecycle,
    sample_json: JSON.stringify(
      draft.items.slice(0, 3).map((item) => ({
        title: item.title.slice(0, 300),
        url: diagnosticUrl(item.url),
        publishedAt: item.publishedAt,
      })),
    ),
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: Date.now() - startedMs,
  };
  await repository.insertSourceCheck(row);
  return {
    sourceId: source.id,
    slug: source.slug,
    status: draft.status,
    accessStatus: draft.accessStatus,
    fetchStatus: draft.fetchStatus,
    parseStatus: draft.parseStatus,
    schemaStatus: draft.schemaStatus,
    policyStatus: draft.policyStatus,
    itemCount: draft.items.length,
    latestItemAt,
    duplicateRatio: duplicate.ratio,
    qualityScore: draft.qualityScore,
    errorType: draft.errorType,
    errorCode: draft.errorCode,
    repairAction: draft.repairAction,
    proxyHint: diagnostics.proxyUsed ? "required" : draft.proxyHint,
    proxyUsed: diagnostics.proxyUsed,
    retentionDecision: draft.retentionDecision,
    recommendedLifecycle: draft.recommendedLifecycle,
    durationMs: row.duration_ms,
  };
}

function diagnose(
  error: unknown,
  source: SourceRow,
  forcedAction?: string,
): Pick<
  CheckDraft,
  | "errorType"
  | "errorCode"
  | "errorSummary"
  | "repairAction"
  | "proxyHint"
  | "retentionDecision"
  | "recommendedLifecycle"
> {
  const fetchError = error instanceof FetchError ? error : null;
  const errorType = fetchError?.type ?? "contract";
  const errorCode = fetchError?.code ?? "ADAPTER_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  const repairAction =
    forcedAction ??
    (errorType === "rate_limit"
      ? "reduce_rate_and_retry"
      : errorType === "timeout"
        ? "retry_with_longer_timeout"
        : errorType === "network"
          ? "verify_network_dns_or_proxy"
          : errorType === "security"
            ? "quarantine_and_review_policy"
            : errorType === "permanent_http"
              ? "replace_or_correct_endpoint"
              : message.toLowerCase().includes("drift") || message.toLowerCase().includes("parse")
                ? "repair_parser_fixture"
                : "inspect_adapter_contract");
  return {
    errorType,
    errorCode,
    errorSummary: sanitizeText(message),
    repairAction,
    proxyHint: errorType === "network" || errorType === "timeout" ? "possible" : "not_required",
    retentionDecision: errorType === "security" ? "isolate" : "observe",
    recommendedLifecycle:
      source.lifecycle_status === "retired"
        ? "retired"
        : errorType === "security"
          ? "quarantined"
          : source.lifecycle_status === "active"
            ? "degraded"
            : "shadow",
  };
}

function recordFetch(diagnostics: FetchDiagnostics, result: FetchResult): void {
  diagnostics.attempts += result.attemptCount;
  diagnostics.responseBytes += result.responseBytes;
  diagnostics.httpStatus = result.status;
  diagnostics.finalUrl = diagnosticUrl(result.finalUrl);
  diagnostics.contentType = result.headers.get("content-type")?.slice(0, 255) ?? null;
  diagnostics.proxyUsed ||= result.transport === "env-proxy";
}

function duplicateStats(items: CollectedSignal[]): { count: number; ratio: number } {
  if (items.length === 0) return { count: 0, ratio: 0 };
  const identities = new Set<string>();
  let duplicates = 0;
  for (const item of items) {
    const identity = `${safeCanonical(item.url)}\n${normalizeTitle(item.title)}`;
    if (identities.has(identity)) duplicates += 1;
    else identities.add(identity);
  }
  return { count: duplicates, ratio: duplicates / items.length };
}

function validateItems(items: CollectedSignal[]): {
  valid: CollectedSignal[];
  invalid: number;
} {
  const valid = items.filter((item) => {
    if (!item.title.trim()) return false;
    if (!Number.isFinite(new Date(item.publishedAt).getTime())) return false;
    if (item.rawMeta.dateInferred === true) return false;
    try {
      const url = new URL(item.url);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  });
  return { valid, invalid: items.length - valid.length };
}

function latestDate(items: CollectedSignal[]): string | null {
  const timestamps = items
    .map((item) => new Date(item.publishedAt).getTime())
    .filter((value) => Number.isFinite(value));
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

function diagnosticUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function safeCanonical(value: string): string {
  try {
    return canonicalizeUrl(value);
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sanitizeText(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/(token|secret|password|cookie|authorization|api[_-]?key)=?[^\s&]*/gi, "$1=[redacted]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[redacted]")
    .replace(/\/home\/[^/\s]+/g, "/home/[redacted]")
    .slice(0, 2_000);
}

function summarizeAudit(
  jobId: string,
  startedAt: string,
  results: SourceCheckResult[],
): SourceAuditReport {
  return {
    jobId,
    startedAt,
    finishedAt: new Date().toISOString(),
    total: results.length,
    healthy: results.filter((result) => result.status === "healthy").length,
    degraded: results.filter((result) => result.status === "degraded").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    accessible: results.filter((result) => result.accessStatus === "reachable").length,
    fetched: results.filter((result) => ["succeeded", "not_modified"].includes(result.fetchStatus))
      .length,
    withContent: results.filter((result) => result.itemCount > 0).length,
    results,
  };
}
