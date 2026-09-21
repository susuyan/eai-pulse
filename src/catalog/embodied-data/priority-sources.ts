import { hasAdapter } from "../../collectors/index.js";
import {
  type EmbodiedPipelineStage,
  EmbodiedPipelineStageSchema,
} from "../../domain/embodied-data.js";
import type { Acquisition } from "../sources.js";
import { embodiedSourceCatalog } from "./sources.js";

export interface EmbodiedPrioritySource {
  slug: string;
  endpoint: string;
  adapter: string;
  acquisition: Acquisition;
  adapterVersion: string;
  reviewedOn: string;
  reviewNote: string;
}

interface PriorityCatalogSource {
  slug: string;
  homepageUrl: string;
  identityHosts?: readonly string[];
  contentScope?: string;
  lifecycleStatus: string;
  maintenanceStatus: string;
  mapStatus?: string;
  adapterVersion?: string;
  region: string;
  category: string;
  pipelineStages?: readonly EmbodiedPipelineStage[];
}

// These are reviewed trial configurations, not evidence of parser or policy readiness.
// Offline fixture evidence does not approve automation or shadow observation.
export const embodiedPrioritySources: readonly EmbodiedPrioritySource[] = [
  {
    slug: "samr-standards",
    endpoint: "https://www.samr.gov.cn/bzjss/",
    adapter: "web-scraper",
    acquisition: "html",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Listing MM-DD agrees with the same-host detail's visible publication label. Conflicting PubDate is retained, not selected. Robots returned 404; policy review remains required.",
  },
  {
    slug: "beijing-humanoid-center",
    endpoint: "https://www.x-humanoid.com/news.html",
    adapter: "web-scraper",
    acquisition: "html",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Official news page linked by the catalog homepage; dated cards have fixture coverage. Robots allows public paths; automation policy review remains pending.",
  },
  {
    slug: "internrobotics",
    endpoint: "https://api.github.com/repos/InternRobotics/InternUtopia/releases?per_page=3",
    adapter: "json-api",
    acquisition: "api",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Public release API for the catalog GitHub organization. Release aliases have fixture coverage; Atom paths are robots-disallowed and automation policy review remains pending.",
  },
  {
    slug: "horizon-holomotion",
    endpoint: "https://api.github.com/repos/HorizonRobotics/HoloMotion/releases?per_page=3",
    adapter: "json-api",
    acquisition: "api",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Public release API for the catalog repository. Release aliases have fixture coverage; Atom paths are robots-disallowed and automation policy review remains pending.",
  },
  {
    slug: "opendrivelab",
    endpoint: "https://opendrivelab.com/",
    adapter: "web-scraper",
    acquisition: "html",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Official research and news page contains dates. Robots has no path prohibition; its content-signal terms still require use-specific review.",
  },
  {
    slug: "pnp-robotics",
    endpoint: "https://www.pnprobotics.com/",
    adapter: "web-scraper",
    acquisition: "html",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Official listing links to same-host details with explicit publication labels. Robots returned 404; automation policy review remains pending.",
  },
  {
    slug: "nvidia-isaac-groot",
    endpoint: "https://api.github.com/repos/NVIDIA/Isaac-GR00T/releases?per_page=3",
    adapter: "json-api",
    acquisition: "api",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Public release API for the catalog repository. Release aliases have fixture coverage; Atom paths are robots-disallowed and automation policy review remains pending.",
  },
  {
    slug: "figure-ai",
    endpoint: "https://www.figure.ai/news",
    adapter: "web-scraper",
    acquisition: "html",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Official news listing linked by the Helix page. Robots does not block news; only dated original article metadata is eligible.",
  },
  {
    slug: "one-x",
    endpoint: "https://www.1x.tech/ai",
    adapter: "web-scraper",
    acquisition: "html",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Official AI page contains dated research metadata. Robots returned 404; policy review remains required before shadow observation.",
  },
  {
    slug: "robocasa",
    endpoint: "https://api.github.com/repos/robocasa/robocasa/releases?per_page=3",
    adapter: "json-api",
    acquisition: "api",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Official release API returns explicit published_at dates and public release links, covered by fixtures. Automation policy review remains pending.",
  },
  {
    slug: "nist-physical-ai",
    endpoint: "https://www.nist.gov/programs-projects/physical-ai-and-data-generation-robotics",
    adapter: "web-scraper",
    acquisition: "html",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Official program page is not robots-disallowed. Fixture date is explicit Created December 11, 2018, not its 2026 modification or news publication; policy review remains pending.",
  },
  {
    slug: "itu-robot-data-factory",
    endpoint: "https://www.itu.int/ITU-T/workprog/wp_item.aspx?isn=24285",
    adapter: "web-scraper",
    acquisition: "html",
    adapterVersion: "1",
    reviewedOn: "2026-09-21",
    reviewNote:
      "Public work-program record is robots-accessible. Fixture uses first registration, not standard approval. Policy review remains pending; private documents and standard texts stay excluded.",
  },
];

export const embodiedPrioritySourceSlugs = embodiedPrioritySources.map((entry) => entry.slug);

export interface PrioritySourceContract {
  slug: string;
  adapter: string;
  adapterVersion: string;
  status: "passed" | "failed";
  policy: {
    status: "pending" | "restricted" | "allowed_metadata";
    reviewedAt: string | null;
    reviewer: string | null;
    reason: string | null;
  };
}

// Pinned independently of the cohort: a version edit must not inherit a passing contract.
// The fixture suite verifies these records. No automation policy has been approved.
export const prioritySourceContracts: readonly PrioritySourceContract[] = (
  [
    ["samr-standards", "web-scraper", "1"],
    ["beijing-humanoid-center", "web-scraper", "1"],
    ["internrobotics", "json-api", "1"],
    ["horizon-holomotion", "json-api", "1"],
    ["opendrivelab", "web-scraper", "1"],
    ["pnp-robotics", "web-scraper", "1"],
    ["nvidia-isaac-groot", "json-api", "1"],
    ["figure-ai", "web-scraper", "1"],
    ["one-x", "web-scraper", "1"],
    ["robocasa", "json-api", "1"],
    ["nist-physical-ai", "web-scraper", "1"],
    ["itu-robot-data-factory", "web-scraper", "1"],
  ] as const
).map(([slug, adapter, adapterVersion]) => ({
  slug,
  adapter,
  adapterVersion,
  status: "passed",
  policy: { status: "pending", reviewedAt: null, reviewer: null, reason: null },
}));

const acquisitionByAdapter: Readonly<Record<string, Acquisition>> = {
  rss: "rss",
  "github-releases": "github",
  "json-api": "api",
  "generic-api": "api",
  "web-scraper": "html",
};

/** Validate the whole selection synchronously before callers start any network work. */
export function validateEmbodiedPrioritySources(
  catalog: readonly PriorityCatalogSource[],
  entries: readonly EmbodiedPrioritySource[],
): void {
  if (entries.length > 18) {
    throw new Error("Priority cohort must contain 12 to 18 sources");
  }
  const currentSlugs = new Set(embodiedSourceCatalog.map((source) => source.slug));
  const bySlug = new Map(catalog.map((source) => [source.slug, source]));
  const seen = new Set<string>();
  const selected: PriorityCatalogSource[] = [];
  for (const entry of entries) {
    if (seen.has(entry.slug))
      throw new Error(`Priority cohort has duplicate source: ${entry.slug}`);
    seen.add(entry.slug);
    const source = bySlug.get(entry.slug);
    if (!source) throw new Error(`Priority cohort has unknown source: ${entry.slug}`);
    if (
      !currentSlugs.has(source.slug) ||
      (source.contentScope && source.contentScope !== "embodied-data")
    ) {
      throw new Error(`Priority source must have embodied-data scope: ${entry.slug}`);
    }
    if (source.lifecycleStatus === "retired" || source.maintenanceStatus === "retired") {
      throw new Error(`Priority source is retired: ${entry.slug}`);
    }
    if (source.mapStatus === "restricted" || source.maintenanceStatus === "restricted") {
      throw new Error(`Priority source is restricted: ${entry.slug}`);
    }
    if (!hasAdapter(entry.adapter) || !Object.hasOwn(acquisitionByAdapter, entry.adapter)) {
      throw new Error(`Priority source requires a recognized reusable adapter: ${entry.slug}`);
    }
    if (entry.acquisition !== acquisitionByAdapter[entry.adapter]) {
      throw new Error(`Priority source acquisition does not match its adapter: ${entry.slug}`);
    }
    if (
      !entry.adapterVersion.trim() ||
      !source.adapterVersion?.trim() ||
      entry.adapterVersion !== source.adapterVersion
    ) {
      throw new Error(`Priority source adapter version mismatch or empty version: ${entry.slug}`);
    }
    validateEndpoint(source, entry.endpoint);
    if (
      !entry.reviewNote.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn) ||
      !Number.isFinite(Date.parse(entry.reviewedOn)) ||
      new Date(entry.reviewedOn).toISOString().slice(0, 10) !== entry.reviewedOn
    ) {
      throw new Error(`Priority source requires a dated acquisition review: ${entry.slug}`);
    }
    selected.push(source);
  }
  if (selected.length < 12) {
    throw new Error("Priority cohort must contain 12 to 18 sources");
  }
  if (selected.filter((source) => source.region === "CN").length < 6) {
    throw new Error("Priority cohort requires at least 6 CN sources");
  }
  if (selected.filter((source) => source.region === "GLOBAL").length < 4) {
    throw new Error("Priority cohort requires at least 4 GLOBAL sources");
  }
  if (new Set(selected.map((source) => source.category)).size < 4) {
    throw new Error("Priority cohort requires at least 4 categories");
  }
  const stages = new Set(selected.flatMap((source) => source.pipelineStages ?? []));
  if (EmbodiedPipelineStageSchema.options.some((stage) => !stages.has(stage))) {
    throw new Error("Priority cohort must cover all 6 pipeline stages");
  }
}

function validateEndpoint(source: PriorityCatalogSource, value: string): void {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(`Priority source requires a valid HTTPS endpoint: ${source.slug}`);
  }
  if (endpoint.protocol !== "https:") {
    throw new Error(`Priority source requires an HTTPS endpoint: ${source.slug}`);
  }
  if (endpoint.username || endpoint.password) {
    throw new Error(`Priority endpoint must not contain credentials: ${source.slug}`);
  }
  const homepage = new URL(source.homepageUrl);
  if (
    ["api.github.com", "github.com"].includes(endpoint.hostname) &&
    homepage.hostname === "github.com"
  ) {
    const repository =
      endpoint.hostname === "api.github.com"
        ? endpoint.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases$/)
        : endpoint.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
    const [owner, name] = homepage.pathname.split("/").filter(Boolean);
    if (
      repository &&
      repository[1]?.toLowerCase() === owner?.toLowerCase() &&
      (!name || repository[2]?.toLowerCase() === name.toLowerCase())
    )
      return;
  } else {
    const hosts = [homepage.hostname, ...(source.identityHosts ?? [])];
    if (hosts.some((host) => endpoint.hostname === host || endpoint.hostname.endsWith(`.${host}`)))
      return;
  }
  throw new Error(`Priority endpoint must belong to the official source: ${source.slug}`);
}
