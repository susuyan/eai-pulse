import { type CheerioAPI, load } from "cheerio";
import type { AnyNode } from "domhandler";
import type { HtmlDate, HtmlExtraction, HtmlField } from "../domain/html-extraction.js";
import type { CollectedSignal, SourceDescriptor } from "../domain/types.js";
import type { CollectContext } from "./types.js";

/** Extract declared metadata only. Scripts are parsed as data, never executed. */
export async function collectConfiguredHtml(
  body: string,
  source: SourceDescriptor,
  context: CollectContext,
  rules: HtmlExtraction,
): Promise<CollectedSignal[]> {
  const $ = load(body);
  const pageLinks = new Set(
    $("a[href]")
      .toArray()
      .map((node) => sameOrigin($(node).attr("href") ?? "", source.config.url))
      .filter(Boolean),
  );
  const records: Array<{ node: AnyNode; data?: unknown }> = [];
  for (const node of $(rules.records).toArray()) {
    if (rules.jsonPath) {
      const payload = JSON.parse($(node).text()) as unknown;
      for (const data of valuesAt(payload, rules.jsonPath)) records.push({ node, data });
    } else records.push({ node });
  }
  const results: CollectedSignal[] = [];
  const seen = new Set<string>();
  let detailRequests = 0;
  for (const record of records.slice(0, 100)) {
    let title = readField($, record.node, record.data, rules.title);
    const link = rules.link
      ? readField($, record.node, record.data, rules.link)
      : source.config.url;
    const url = sameOrigin(`${rules.link?.prefix ?? ""}${link}`, source.config.url);
    if (!title || !url || seen.has(url)) continue;
    if (rules.jsonPath && !pageLinks.has(url)) continue;
    seen.add(url);
    let dateRule = rules.date;
    let rawDate = dateRule ? readField($, record.node, record.data, dateRule) : "";
    let alternate = "";
    if (rules.detail) {
      if (detailRequests >= rules.detail.take) break;
      detailRequests += 1;
      const response = await context.fetchText(
        url,
        {},
        { allowedOrigin: new URL(source.config.url).origin },
      );
      if (!sameOrigin(response.finalUrl, source.config.url) || response.status !== 200)
        throw new Error("Invalid detail response origin or status");
      const detail = load(response.body);
      const root = detail.root().get(0);
      if (!root) throw new Error("Missing detail document");
      title = readField(detail, root, undefined, rules.detail.title);
      dateRule = rules.detail.date;
      rawDate = readField(detail, root, undefined, dateRule);
      alternate = rules.detail.alternateDate
        ? readField(detail, root, undefined, rules.detail.alternateDate)
        : "";
    }
    const date = dateRule ? parseDate(rawDate, dateRule) : null;
    if (!title || !dateRule || !date) {
      if (rules.detail) throw new Error("Invalid detail metadata (no valid dated records)");
      continue;
    }
    results.push({
      externalId: url,
      url,
      title,
      summary: title,
      language: source.language,
      publishedAt: date.value,
      category: source.config.category ?? "industry",
      tags: [],
      metrics: { platforms: ["web"] },
      rawMeta: {
        adapter: "web-scraper",
        source: "configured-html",
        dateInferred: false,
        dateSemantic: dateRule.semantic,
        datePrecision: date.precision,
        dateValue: rawDate,
        ...(alternate && alternate !== rawDate
          ? { dateConflict: { selected: rawDate, alternate } }
          : {}),
      },
    });
  }
  if (!results.length)
    throw new Error("Configured HTML has no valid dated records (empty or schema drift)");
  return results.slice(0, source.config.take ?? 30);
}

function readField($: CheerioAPI, node: AnyNode, data: unknown, field: HtmlField): string {
  if (field.path) {
    const values = valuesAt(data, field.path);
    return values.length === 1 && typeof values[0] === "string" ? values[0].trim() : "";
  }
  const selection = field.selector ? $(node).find(field.selector) : $(node);
  if (selection.length !== 1) return "";
  const clean = selection.clone();
  clean.find("script,style").remove();
  clean.find("br").replaceWith(" ");
  const value = field.attribute ? selection.attr(field.attribute) : clean.text();
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function valuesAt(value: unknown, path: string): unknown[] {
  let values: unknown[] = [value];
  for (const key of path.split(".")) {
    if (["__proto__", "prototype", "constructor"].includes(key)) return [];
    values = values
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        if (key === "*") return Object.values(item);
        return Object.hasOwn(item, key) ? [(item as Record<string, unknown>)[key]] : [];
      })
      .slice(0, 100);
  }
  return values;
}

function sameOrigin(value: string, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.origin !== new URL(base).origin
    )
      return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function parseDate(raw: string, rule: HtmlDate): { value: string; precision: string } | null {
  if (rule.prefix && !raw.startsWith(rule.prefix)) return null;
  const value = raw.slice(rule.prefix?.length ?? 0).trim();
  if (rule.format === "iso") {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
      return null;
    if (!validDay(value.slice(0, 10))) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? { value: date.toISOString(), precision: "instant" }
      : null;
  }
  const ymd = value.match(/^(\d{4})[-.](\d{2})[-.](\d{2})(?:\s|$)/);
  let day = ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : "";
  if (rule.format === "month-name") {
    const match = value.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})(?:,|$)/);
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const month = months.indexOf(match?.[1] ?? "") + 1;
    day =
      match && month
        ? `${match[3]}-${String(month).padStart(2, "0")}-${match[2]?.padStart(2, "0")}`
        : "";
  }
  return validDay(day) ? { value: `${day}T00:00:00.000Z`, precision: "day" } : null;
}

function validDay(day: string): boolean {
  const date = new Date(`${day}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === day
  );
}
