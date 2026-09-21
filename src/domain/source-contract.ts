import { createHash } from "node:crypto";
import type { SourceRow } from "../db/types.js";
import { SourceConfigSchema } from "./types.js";

interface SourceContract {
  adapter: string;
  adapterVersion: string;
  acquisition: string;
  language: string;
  homepageUrl: string;
  config: unknown;
}

/** Bind audit evidence to normalization inputs, without storing those inputs. */
export function sourceContractFingerprint(source: SourceContract): string {
  const config = SourceConfigSchema.parse(source.config);
  const defaultTake =
    source.adapter === "github-releases"
      ? 20
      : ["web-scraper", "generic-api"].includes(source.adapter)
        ? 30
        : 50;
  const effective = {
    schemaVersion: 1,
    adapter: source.adapter,
    adapterVersion: source.adapterVersion,
    acquisition: source.acquisition,
    language: source.language,
    homepageUrl: normalizedUrl(source.homepageUrl),
    config: {
      ...config,
      url: normalizedUrl(config.url),
      take: config.take ?? defaultTake,
      category:
        config.category ?? (source.adapter === "github-releases" ? "open-source" : "industry"),
      ...(source.adapter === "aihot" ? { mode: config.mode ?? "selected" } : {}),
      ...(source.adapter === "huggingnews" ? { detailTake: config.detailTake ?? 3 } : {}),
    },
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(effective)))
    .digest("hex");
}

export function sourceRowContractFingerprint(
  source: Pick<
    SourceRow,
    "adapter" | "adapter_version" | "acquisition" | "language" | "homepage_url" | "config_json"
  >,
): string {
  return sourceContractFingerprint({
    adapter: source.adapter,
    adapterVersion: source.adapter_version,
    acquisition: source.acquisition,
    language: source.language,
    homepageUrl: source.homepage_url,
    config: JSON.parse(source.config_json),
  });
}

function normalizedUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}
