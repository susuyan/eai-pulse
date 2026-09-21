import { isIP } from "node:net";
import type { SourceAdapter } from "./types.js";

export const jsonApiAdapter: SourceAdapter = {
  kind: "json-api",
  async collect(source, context) {
    const { body, status, finalUrl } = await context.fetchText(
      source.config.url,
      {},
      {
        allowedOrigin: new URL(source.config.url).origin,
      },
    );
    if (status === 304) return [];
    if (new URL(finalUrl).origin !== new URL(source.config.url).origin) {
      throw new Error("JSON API response origin mismatch");
    }
    const payload = JSON.parse(body) as unknown;
    if (!Array.isArray(payload)) throw new Error("json-api adapter expects an array payload");
    const seen = new Set<string>();
    return payload
      .flatMap((item, index) => {
        if (!isRecord(item)) {
          throw new Error(`Invalid JSON item at index ${index}`);
        }
        if (item.draft === true) return [];
        const title = [item.title, item.name, item.tag_name].find(
          (value) => typeof value === "string" && value.trim(),
        );
        const value = item.html_url ?? item.url;
        if (typeof title !== "string" || typeof value !== "string")
          throw new Error(`Invalid JSON item at index ${index}`);
        const url = publicUrl(value);
        const publishedAt = validDate(item.publishedAt ?? item.published_at);
        if (seen.has(url)) return [];
        seen.add(url);
        return [
          {
            externalId: typeof item.id === "string" ? item.id : url,
            url,
            title: title.trim(),
            summary: typeof item.summary === "string" ? item.summary.slice(0, 8_000) : title.trim(),
            language: source.language,
            publishedAt,
            category:
              typeof item.category === "string"
                ? item.category
                : (source.config.category ?? "industry"),
            tags: Array.isArray(item.tags)
              ? item.tags.filter((value): value is string => typeof value === "string")
              : [],
            metrics: {},
            rawMeta: { dateInferred: false },
          },
        ];
      })
      .slice(0, source.config.take ?? 50);
  },
};

function validDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))
    throw new Error("Missing or invalid JSON publication date");
  const date = new Date(value);
  const day = value.slice(0, 10);
  if (
    !Number.isFinite(date.getTime()) ||
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day
  )
    throw new Error("Invalid JSON publication date");
  return date.toISOString();
}

function publicUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") ||
    url.hostname.endsWith(".localhost")
  )
    throw new Error("Invalid public JSON item URL");
  url.hash = "";
  return url.href;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
