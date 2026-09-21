import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { embodiedLaunchEvents } from "../src/catalog/embodied-data/events.js";
import { embodiedTrends, evolutionPhases } from "../src/catalog/embodied-data/evolution.js";
import { legacySourceCatalog as sourceCatalog } from "../src/catalog/sources.js";
import { githubReleasesAdapter } from "../src/collectors/github-releases.js";
import { rssAdapter } from "../src/collectors/rss.js";
import type { CollectContext } from "../src/collectors/types.js";
import type { SourceDescriptor } from "../src/domain/types.js";
import type {
  EnrichedEvent,
  NarrativeStage,
  PublicSource,
  StaticSiteModel,
} from "../src/pipeline/static-site/dto.js";
import { buildPublicEmbodiedNarrative } from "../src/pipeline/static-site/embodied-narrative.js";
import {
  analyzeTechnologyCoverage,
  eventDevelopments,
  eventTouchesNarrativeStage,
  evidenceForNarrativeStage,
  groupEventsByYearMonth,
  groupTimelineMonthItems,
  isHighImpactTimelineResearch,
  isRecentEvent,
  isTimelineResearchEvent,
  latestNarrativeStageDevelopmentAt,
  recentMonthlyDensity,
  recentResearchBatches,
  sortEventsByLatestDevelopment,
  summarizeSourcePortfolio,
  timelineEventsForPresentation,
} from "../src/pipeline/static-site/intelligence.js";
import { renderEmbodiedHome } from "../src/pipeline/static-site/pages/home.js";
import { renderStaticPages, renderTimeline } from "../src/pipeline/static-site/pages.js";

describe("static-site intelligence consumption model", () => {
  it("server-renders the phase handoff and all eight trends in curated order", () => {
    const model = evolutionModel();
    model.generatedAt = "2027-01-01T00:00:00Z";
    const home = renderEmbodiedHome(model, "zh-CN");
    const handoff = home.match(/<section[^>]*data-home-evolution[\s\S]*?<\/section>/)?.[0] ?? "";
    const previous = model.evolutionPhases[4];
    const current = model.evolutionPhases[5];
    if (!previous || !current) throw new Error("Missing phase fixture");
    expect(handoff.indexOf(previous.title)).toBeGreaterThan(-1);
    expect(handoff.indexOf(current.title)).toBeGreaterThan(handoff.indexOf(previous.title));
    expect(handoff).toContain(previous.turningPoint);
    expect(handoff).toContain(current.thesis);
    expect(handoff).toContain(current.start);
    expect(handoff).toContain(current.end);
    expect(handoff).toContain("策展截止");
    expect(handoff).toContain("最新事件日期");
    expect(handoff).not.toContain("2027-01-01");
    expect(handoff).toContain('href="__PREFIX__timeline/"');
    expect(home).toContain("data-embodied-trends");
    const cards = [
      ...home.matchAll(/<article[^>]*data-embodied-trend="([^"]+)"[\s\S]*?<\/article>/g),
    ];
    expect(cards.map((card) => card[1])).toEqual(model.embodiedTrends.map((trend) => trend.slug));
    expect(cards).toHaveLength(8);
    for (const [index, card] of cards.entries()) {
      const trend = model.embodiedTrends[index];
      if (!trend) throw new Error("Missing trend fixture");
      expect(card[0]).toContain(trend.title);
      expect(card[0]).toContain(trend.thesis);
      expect(card[0]).toContain(trend.whyNow);
      expect(card[0]).toContain("反证与未知");
      expect(card[0]).toContain("尚未收录独立反证");
      for (const next of trend.nextWatch) expect(card[0]).toContain(next);
      for (const event of trend.events) {
        expect(card[0]).toContain(`href="__PREFIX__events/${event.slug}/"`);
      }
      for (const stage of trend.pipelineStages) {
        expect(card[0]).toContain(model.pipelineStages.find((item) => item.slug === stage)?.name);
      }
      expect(card[0]).not.toMatch(/\bhidden\b|<template|https?:\/\//);
    }
    expect(home).not.toMatch(/\/lines\/|六个领域趋势|随机趋势/);
  });

  it("escapes homepage editorial fields and separates linked counter-evidence", () => {
    const model = evolutionModel();
    const trend = model.embodiedTrends[0];
    const current = model.evolutionPhases.at(-1);
    if (!trend || !current) throw new Error("Missing narrative fixture");
    current.title = '<img src=x onerror="alert(1)">';
    current.thesis = "<script>unsafe</script>";
    trend.title = '<svg onload="alert(1)">';
    trend.thesis = "<em>Thesis</em>";
    trend.whyNow = "A & B";
    trend.nextWatch = ["<iframe>Watch</iframe>"];
    trend.counterEvents = [
      { slug: 'counter" onclick="alert(1)', title: "<b>Counter</b>", role: "counter-evidence" },
    ];
    for (const locale of ["zh-CN", "en"] as const) {
      const home = renderEmbodiedHome(model, locale);
      expect(home).not.toMatch(/<img|<script|<svg|<em>|<iframe|<b>|onclick="alert/);
      expect(home).toContain("&lt;img");
      expect(home).toContain("&lt;em&gt;Thesis&lt;/em&gt;");
      expect(home).toContain("A &amp; B");
      expect(home).toContain("&lt;b&gt;Counter&lt;/b&gt;");
      expect(home).toContain('href="__PREFIX__events/counter%22%20onclick%3D%22alert(1)/"');
    }
  });

  it("renders chronological phases, six evidence-bound impacts, and every Event in reverse order", () => {
    const model = evolutionModel();
    const page = renderTimeline(model, "zh-CN");
    const phases = model.evolutionPhases;
    const anchors = [...page.matchAll(/data-evolution-phase-link="([^"]+)"/g)].map((m) => m[1]);
    expect(anchors).toEqual(phases.map((phase) => phase.slug));
    expect(page.match(/data-evolution-phase="/g)).toHaveLength(6);
    expect(page.match(/data-evolution-stage="/g)).toHaveLength(36);
    for (const phase of phases) {
      expect(page).toContain(`id="phase-${phase.slug}"`);
      expect(page).toContain(phase.title);
      expect(page).toContain(phase.thesis);
      expect(page).toContain(phase.turningPoint);
      for (const signal of phase.nextSignals) expect(page).toContain(signal);
      for (const relation of [...phase.events, ...phase.counterEvents]) {
        expect(page).toContain(`href="__PREFIX__events/${relation.slug}/"`);
      }
    }
    expect(page).toContain("暂无公开证据");
    expect(page).toContain("反证与未知");
    const index = page.split("data-evolution-event-index")[1] ?? "";
    const eventSlugs = [...index.matchAll(/data-evolution-event="([^"]+)"/g)].map((m) => m[1]);
    expect(eventSlugs).toHaveLength(42);
    expect(eventSlugs).toEqual(
      [...model.embodiedEvents]
        .sort((left, right) => Date.parse(right.happenedAt) - Date.parse(left.happenedAt))
        .map((event) => event.slug),
    );
    expect(page).not.toMatch(/\/lines\/|六个领域趋势|模型价格|随机趋势|https?:\/\//);
  });

  it("bounds the latest-phase summary by the curation cutoff and actual Event date", () => {
    const model = evolutionModel();
    model.generatedAt = "2027-01-01T00:00:00Z";
    const page = renderTimeline(model, "zh-CN");
    const summary = page.match(/<section[^>]*data-evolution-summary[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(summary).toContain(model.evolutionPhases[5]?.title);
    expect(summary).toContain(model.evolutionPhases[4]?.turningPoint);
    expect(summary).toContain("2026-09-20");
    expect(summary).toContain("最新事件日期");
    expect(summary).not.toContain("2027-01-01");
    expect(summary.match(/data-evolution-impact-summary="/g)).toHaveLength(6);
  });

  it("escapes narrative content and retains internal Event routes in both locales", () => {
    const model = evolutionModel();
    const phase = model.evolutionPhases[0];
    if (!phase) throw new Error("Missing narrative fixture");
    phase.title = '<img src=x onerror="alert(1)">';
    phase.thesis = "<script>unsafe</script>";
    phase.turningPoint = "A & B";
    phase.nextSignals = ["<em>Watch</em>"];
    phase.stageImpacts["demand-definition"].summary = '<iframe src="https://unsafe.test">';
    phase.events[0] = {
      slug: 'event" onclick="alert(1)',
      title: "<svg>unsafe</svg>",
      role: "supporting-evidence",
    };
    for (const locale of ["zh-CN", "en"] as const) {
      const page = renderTimeline(model, locale);
      expect(page).not.toMatch(/<img|<script|<iframe|<svg|<em>/);
      expect(page).toContain("&lt;img");
      expect(page).toContain("A &amp; B");
      expect(page).toContain("&lt;em&gt;Watch&lt;/em&gt;");
      expect(page).toContain("&lt;svg&gt;unsafe&lt;/svg&gt;");
      expect(page).not.toContain('onclick="alert');
    }
    expect(renderTimeline(model, "en")).toContain("No public evidence");
  });

  it("renders the exact embodied-data route and navigation contract", () => {
    const model = embodiedSiteModel();
    const pages = renderStaticPages(model);
    const paths = pages.map((page) => page.path).sort();
    const expectedLocalePaths = [
      "index.html",
      "pipeline/index.html",
      "assets/index.html",
      "peers/index.html",
      "sources/index.html",
      "scout/index.html",
      "timeline/index.html",
      "changelog/index.html",
      "legal/index.html",
      "events/embodied-event/index.html",
      "404.html",
    ];
    expect(paths).toEqual(
      [...expectedLocalePaths, ...expectedLocalePaths.map((path) => `en/${path}`)].sort(),
    );

    const home = pages.find((page) => page.path === "index.html")?.content ?? "";
    for (const [label, href] of [
      ["关键变化", "./"],
      ["数据管线", "./pipeline/"],
      ["数据资产", "./assets/"],
      ["行业同行", "./peers/"],
      ["来源地图", "./sources/"],
      ["行动建议", "./scout/"],
    ]) {
      expect(home).toContain(`href="${href}"`);
      expect(home).toContain(label);
    }
    expect(
      model.pipelineStages.map((stage) => home.indexOf(`data-pipeline-stage="${stage.slug}"`)),
    ).toEqual(
      [
        ...model.pipelineStages.map((stage) => home.indexOf(`data-pipeline-stage="${stage.slug}"`)),
      ].sort((a, b) => a - b),
    );
    expect(home).toContain("具身数据情报与生产洞察");
    expect(home).toContain("数据资产");
    expect(home).toContain("行业同行");
    expect(home).toContain("来源地图");
    expect(home).toContain("行动建议");
    expect(home).toContain("https://example.com/evidence");
    expect(home).not.toContain("模型价格");
    expect(home).not.toContain("六个领域趋势");
  });

  it("renders complete English stage labels and English event metadata fallbacks", () => {
    const model = embodiedSiteModel();
    const event = model.embodiedEvents[0];
    if (!event) throw new Error("Missing event fixture");
    event.title = "具身数据事件";
    event.factSummary = "中文事实摘要";
    const pages = renderStaticPages(model);
    const pipeline = pages.find((page) => page.path === "en/pipeline/index.html")?.content ?? "";
    const eventPage =
      pages.find((page) => page.path === "en/events/embodied-event/index.html")?.content ?? "";
    const head = eventPage.match(/<head>[\s\S]*?<\/head>/)?.[0] ?? "";

    expect(pipeline).toContain("Demand and task definition");
    expect(pipeline).toContain("Decide what data to collect");
    expect(pipeline).not.toContain("需求与任务定义");
    expect(head).toContain("Embodied Event · Agent Pulse");
    expect(head).toContain("Evidence and production impact for the embodied-data event");
    expect(head).not.toContain("具身数据事件");
    expect(head).not.toContain("中文事实摘要");
    expect(eventPage).toContain("Original-language record");
  });

  it("renders milestones, peer comparisons, counter-evidence, and next signals per stage", () => {
    const pages = renderStaticPages(embodiedSiteModel());
    const pipeline = pages.find((page) => page.path === "pipeline/index.html")?.content ?? "";

    expect(pipeline).toContain("阶段里程碑");
    expect(pipeline).toContain("同行对比");
    expect(pipeline).toContain("反证与未知");
    expect(pipeline).toContain("下一信号");
    expect(pipeline).toContain("embodied-event");
    expect(pipeline).toContain("Next signal");
    expect(pipeline).toContain("Example Lab");
  });

  it("rejects unsafe source and peer links and keeps object relations navigable", () => {
    const model = embodiedSiteModel();
    const source = model.sources[0];
    const peer = model.peers[0];
    const event = model.embodiedEvents[0];
    if (!source || !peer || !event) throw new Error("Missing public-site fixtures");
    source.homepageUrl = "javascript:alert('source')";
    peer.websiteUrl = "javascript:alert('peer')";
    const capability = peer.capabilities[0];
    if (!capability) throw new Error("Missing capability fixture");
    capability.sourceUrl = "javascript:alert('evidence')";
    model.datasets = [
      {
        slug: "droid",
        name: "DROID",
        publisher: "Example Lab",
        canonicalUrl: "https://example.com/droid",
        version: "1",
        releaseDate: "2026-09-20",
        pipelineStages: ["acquisition-route"],
        modalities: ["rgb"],
        embodiments: ["single-arm"],
        scenarios: ["tabletop"],
        tasks: ["manipulation"],
        acquisitionMethods: ["teleoperation"],
        dataFormats: ["RLDS"],
        scaleClaims: [],
        sensorConfiguration: [],
        synchronization: [],
        calibration: [],
        annotations: [],
        qualityMethods: ["task completion"],
        license: null,
        access: { mode: "open", url: "https://example.com/droid" },
        useCases: ["robot policy training"],
        knownResults: [],
        limitations: [],
        evidenceStatus: "verified",
        relatedEvents: [{ slug: event.slug, title: "Embodied event", role: "release" }],
      },
    ];

    const pages = renderStaticPages(model);
    const sources = pages.find((page) => page.path === "sources/index.html")?.content ?? "";
    const peers = pages.find((page) => page.path === "peers/index.html")?.content ?? "";
    const assets = pages.find((page) => page.path === "assets/index.html")?.content ?? "";

    expect(sources).not.toContain("javascript:");
    expect(peers).not.toContain("javascript:");
    expect(sources).toContain("Example Source");
    expect(peers).toContain('id="example-lab"');
    expect(assets).toContain('href="../events/embodied-event/"');
  });

  it("renders every governed source with map states and computed coverage gaps", () => {
    const model = embodiedSiteModel();
    const exampleSource = model.sources[0];
    if (!exampleSource) throw new Error("Missing public source fixture");
    model.sources = [
      {
        ...exampleSource,
        mapStatus: "integrated",
        pipelineStages: ["acquisition-route"],
        substituteFor: [],
        restrictionNote: "",
      },
      {
        ...exampleSource,
        slug: "restricted-manual-source",
        name: "Restricted Manual Source",
        acquisition: "manual",
        mapStatus: "restricted",
        pipelineStages: ["demand-definition"],
        restrictionNote: "Manual review only.",
        healthStatus: "unchecked",
      },
    ];

    const sourcesPage =
      renderStaticPages(model).find((page) => page.path === "sources/index.html")?.content ?? "";

    expect(sourcesPage).toContain("已接入");
    expect(sourcesPage).toContain("待接入");
    expect(sourcesPage).toContain("受限");
    expect(sourcesPage).toContain("替代来源");
    expect(sourcesPage).toContain("覆盖缺口");
    expect(sourcesPage).toContain("需求与任务定义 · official");
    expect(sourcesPage.match(/class="source-card"/g)).toHaveLength(2);
    expect(sourcesPage).toContain("Restricted Manual Source");
    expect(sourcesPage).toContain('data-status="restricted"');
    expect(sourcesPage).toContain('data-status="unchecked"');
    const restrictedCard = sourcesPage.match(
      /<article class="source-card"[^>]*data-source-map-status="restricted"[\s\S]*?<\/article>/,
    )?.[0];
    expect(restrictedCard).not.toContain('data-status="healthy"');
  });

  it("sorts one event per card by its latest evidence update", () => {
    const olderEventWithNewUpdate = event("older", "2026-01-01T00:00:00Z", [
      evidence("Official update", "primary", "2026-07-10T00:00:00Z"),
    ]);
    const newerEvent = event("newer", "2026-07-01T00:00:00Z", [
      evidence("Initial report", "secondary", "2026-07-01T00:00:00Z"),
    ]);

    expect(
      sortEventsByLatestDevelopment([newerEvent, olderEventWithNewUpdate]).map((item) => item.slug),
    ).toEqual(["older", "newer"]);
  });

  it("associates incremental evidence with its real stage without rewriting the event origin", () => {
    const originStage = stage("2025-01-01", "2025-12-31");
    const currentStage = stage("2026-01-01", "9999-12-31");
    const item = event("long-running-shift", "2025-06-01T00:00:00Z", [
      evidence("Initial release", "primary", "2025-06-01T00:00:00Z"),
      evidence("Incremental adoption", "secondary", "2026-07-13T00:00:00Z"),
    ]);

    expect(eventTouchesNarrativeStage(item, originStage)).toBe(true);
    expect(eventTouchesNarrativeStage(item, currentStage)).toBe(true);
    expect(evidenceForNarrativeStage(item, originStage).map((item) => item.title)).toEqual([
      "Initial release",
    ]);
    expect(evidenceForNarrativeStage(item, currentStage).map((item) => item.title)).toEqual([
      "Incremental adoption",
    ]);
    expect(latestNarrativeStageDevelopmentAt(item, currentStage)).toBe("2026-07-13T00:00:00.000Z");

    const futureEvidence = evidence("Future validation", "secondary", "2027-02-01T00:00:00Z");
    item.evidence.push(futureEvidence);
    expect(evidenceForNarrativeStage(item, currentStage)).toContain(futureEvidence);
    expect(latestNarrativeStageDevelopmentAt(item, currentStage)).toBe("2027-02-01T00:00:00.000Z");
  });

  it("turns evidence into a chronological event development path", () => {
    const item = event("journey", "2026-07-01T00:00:00Z", [
      evidence("Community response", "amplification", "2026-07-03T00:00:00Z"),
      evidence("Initial report", "secondary", "2026-07-01T00:00:00Z"),
      evidence("Official release", "primary", "2026-07-02T00:00:00Z"),
    ]);

    const developments = eventDevelopments(item);
    expect(developments.map((development) => development.kind)).toEqual([
      "origin",
      "official",
      "discussion",
    ]);
    expect(developments.map((development) => development.evidence.title)).toEqual([
      "Initial report",
      "Official release",
      "Community response",
    ]);
  });

  it("groups event stories into descending year and month sections", () => {
    const events = [
      event("july", "2026-07-01T00:00:00Z", []),
      event("june", "2026-06-30T00:00:00Z", []),
      event("older", "2025-12-01T00:00:00Z", []),
    ];

    const chronology = groupEventsByYearMonth(events);

    expect(chronology.map((group) => group.year)).toEqual([2026, 2025]);
    expect(chronology[0]?.months.map((month) => month.key)).toEqual(["2026-07", "2026-06"]);
    expect(chronology[0]?.months[0]?.events.map((item) => item.slug)).toEqual(["july"]);
  });

  it("aggregates high-impact research from the whole month without losing events", () => {
    const research = [
      researchEvent("paper-1", "2026-07-01T08:00:00Z"),
      researchEvent("paper-2", "2026-07-09T08:00:00Z"),
      researchEvent("paper-3", "2026-07-21T08:00:00Z"),
      researchEvent("paper-4", "2026-07-29T08:00:00Z"),
    ];
    const product = event("product", "2026-07-09T07:00:00Z", []);
    const firstResearch = research[0];
    if (!firstResearch) throw new Error("research fixture missing");
    const items = groupTimelineMonthItems([firstResearch, product, ...research.slice(1)]);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ kind: "event", event: product });
    expect(items[1]).toMatchObject({
      kind: "research-month",
      key: "2026-07",
      events: expect.arrayContaining(research),
    });
  });

  it("caps a monthly research group at the 10 highest-weight papers", () => {
    const research = Array.from({ length: 15 }, (_, index) => ({
      ...researchEvent(`paper-${index}`, "2026-07-09T08:00:00Z"),
      impactScore: 75 + index / 2,
    }));
    const group = groupTimelineMonthItems(research).find((item) => item.kind === "research-month");

    expect(group?.events).toHaveLength(10);
    expect(group?.events[0]?.slug).toBe("paper-14");
    expect(group?.events.map((item) => item.slug)).not.toContain("paper-0");
  });

  it("keeps low-impact papers out of the timeline without changing their event", () => {
    const paper = {
      ...researchEvent("thin-paper", "2026-07-09T08:00:00Z"),
      impactScore: 55,
      valueScore: 58,
    };
    const product = event("product", "2026-07-09T07:00:00Z", []);

    expect(isTimelineResearchEvent(paper)).toBe(true);
    expect(isHighImpactTimelineResearch(paper)).toBe(false);
    expect(timelineEventsForPresentation([paper, product])).toEqual([product]);
    expect(groupTimelineMonthItems([paper, product])).toEqual([{ kind: "event", event: product }]);
  });

  it("recognizes arXiv papers with specific categories and ranks confidence before language", () => {
    const arxivPaper = researchEvent("arxiv-paper", "2026-07-09T08:00:00Z");
    arxivPaper.category = "benchmark";
    const chinese = { ...event("中文事件", "2026-07-09T08:00:00Z", []), title: "中文事件" };
    const english = {
      ...event("English event", "2026-07-09T08:00:00Z", []),
      confidenceScore: 91,
    };
    const highImpactButLowerConfidence = {
      ...english,
      slug: "high-impact-lower-confidence",
      impactScore: 100,
      valueScore: 100,
      confidenceScore: 90,
      heatScore: 90,
    };

    expect(isTimelineResearchEvent(arxivPaper)).toBe(true);
    const regularSlugs = (items: ReturnType<typeof groupTimelineMonthItems>) =>
      items.filter((item) => item.kind === "event").map((item) => item.event.slug);
    expect(regularSlugs(groupTimelineMonthItems([english, chinese]))).toEqual([
      "English event",
      "中文事件",
    ]);
    expect(regularSlugs(groupTimelineMonthItems([english, highImpactButLowerConfidence]))).toEqual([
      "English event",
      "high-impact-lower-confidence",
    ]);
  });

  it("keeps research and regular embodied events in the public timeline", () => {
    const regular = Array.from({ length: 7 }, (_, index) =>
      event(`regular-${index}`, `2026-07-${String(index + 1).padStart(2, "0")}T08:00:00Z`, []),
    );
    const model = {
      embodiedEvents: [...regular, researchEvent("paper", "2026-07-15T08:00:00Z")],
      tracks: [],
    } as unknown as StaticSiteModel;
    const page = renderTimeline(model, "zh-CN");

    expect(page).toContain("paper");
    for (const item of regular) expect(page).toContain(item.slug);
    expect(page.match(/<li>/g)).toHaveLength(8);
  });

  it("keeps the embodied timeline complete without client-side mounting", () => {
    const manyEvents = Array.from({ length: 501 }, (_, index) => {
      const month = 11 - (index % 12);
      return event(
        `event-${index}`,
        new Date(Date.UTC(2026, month, 1 + (index % 20), 8)).toISOString(),
        [],
      );
    });
    const model = { embodiedEvents: manyEvents, tracks: [] } as unknown as StaticSiteModel;
    const lazyPage = renderTimeline(model, "zh-CN");
    const regularPage = renderTimeline(
      {
        ...model,
        embodiedEvents: manyEvents.slice(0, 500) as unknown as StaticSiteModel["embodiedEvents"],
      },
      "zh-CN",
    );

    expect(lazyPage.match(/<li>/g)).toHaveLength(501);
    expect(regularPage.match(/<li>/g)).toHaveLength(500);
    expect(lazyPage).not.toContain("data-timeline-month-template");
  });

  it("highlights only events from the previous seven days", () => {
    expect(isRecentEvent(event("recent", "2026-07-10T00:00:00Z", []), "2026-07-13T00:00:00Z")).toBe(
      true,
    );
    expect(isRecentEvent(event("old", "2026-07-01T00:00:00Z", []), "2026-07-13T00:00:00Z")).toBe(
      false,
    );
    expect(isRecentEvent(event("future", "2026-07-14T00:00:00Z", []), "2026-07-13T00:00:00Z")).toBe(
      false,
    );
  });

  it("reports recent month density without treating the current partial month as a gap", () => {
    const events = [
      ...Array.from({ length: 8 }, (_, index) =>
        event(`july-${index}`, "2026-07-10T00:00:00Z", []),
      ),
      ...Array.from({ length: 6 }, (_, index) =>
        event(`june-${index}`, "2026-06-10T00:00:00Z", []),
      ),
      ...Array.from({ length: 3 }, (_, index) => event(`may-${index}`, "2026-05-10T00:00:00Z", [])),
    ];
    expect(recentMonthlyDensity(events, "2026-07-13T00:00:00Z")).toEqual([
      { key: "2026-07", count: 8, target: 6, status: "in-progress" },
      { key: "2026-06", count: 6, target: 6, status: "balanced" },
      { key: "2026-05", count: 3, target: 6, status: "gap" },
    ]);
  });

  it("explains weekend research gaps instead of fabricating paper events", () => {
    const arxivEvidence = evidence("Paper", "primary", "2026-07-11T04:00:00Z");
    arxivEvidence.url = "https://arxiv.org/abs/2607.00001";
    const paper = {
      ...event("paper", "2026-07-11T04:00:00Z", [arxivEvidence]),
      category: "research",
    };
    expect(recentResearchBatches([paper], "2026-07-13T00:30:00Z")).toEqual([
      { day: "2026-07-13", count: 0, status: "waiting" },
      { day: "2026-07-12", count: 0, status: "weekend" },
      { day: "2026-07-11", count: 1, status: "published" },
    ]);
  });

  it("keeps catalog presence separate from effective technical coverage", () => {
    const sources = [
      source("claude-code-releases", "Claude Code Releases", "healthy", "github", [
        "coding-agent",
        "developer",
      ]),
      source("anthropic", "Anthropic", "failed", "html", ["agent", "enterprise"]),
      source("lovable-changelog", "Lovable Changelog", "unchecked", "rss", ["lovable", "product"]),
    ];

    const coverage = analyzeTechnologyCoverage(sources);
    expect(coverage.find((item) => item.slug === "claude-code")).toMatchObject({
      status: "watch",
      healthySources: 1,
    });
    expect(coverage.find((item) => item.slug === "lovable")).toMatchObject({
      status: "unchecked",
      healthySources: 0,
    });
    expect(coverage.find((item) => item.slug === "a2a")).toMatchObject({ status: "gap" });
  });

  it("summarizes the source portfolio without confusing catalog size with health", () => {
    const sources = [
      {
        ...source("cn-agent", "China Agent", "healthy", "github", ["agent"]),
        region: "CN",
      },
      {
        ...source("global-feed", "Global Feed", "failed", "rss", ["research"]),
        category: "research-eval",
      },
      {
        ...source("observing-feed", "Observing Feed", "healthy", "rss", ["policy"]),
        category: "policy",
        observationEnabled: true,
      },
    ];
    const portfolio = summarizeSourcePortfolio(sources);

    expect(portfolio.acquisitions).toEqual([
      { key: "rss", total: 2, healthy: 1, observing: 1 },
      { key: "github", total: 1, healthy: 1, observing: 0 },
    ]);
    expect(portfolio.health).toEqual([
      { key: "healthy", total: 2, healthy: 2, observing: 1 },
      { key: "failed", total: 1, healthy: 0, observing: 0 },
    ]);
    for (const dimension of [
      portfolio.categories,
      portfolio.regions,
      portfolio.acquisitions,
      portfolio.health,
    ]) {
      expect(dimension.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(sources.length);
    }
  });
});

describe("new first-party technology source fixtures", () => {
  it("parses the A2A release fixture through the configured GitHub adapter", async () => {
    const catalog = sourceCatalog.find((source) => source.slug === "a2a-protocol-releases");
    expect(catalog).toMatchObject({
      adapter: "github-releases",
      lifecycleStatus: "shadow",
      enabled: false,
    });
    const result = await githubReleasesAdapter.collect(
      descriptor(catalog),
      context(await fixture("a2a-releases.atom"), catalog?.endpoint ?? ""),
    );
    expect(result[0]).toMatchObject({
      title: "v1.0.1",
      url: "https://github.com/a2aproject/A2A/releases/tag/v1.0.1",
    });
  });

  it("parses the Lovable changelog fixture through the configured RSS adapter", async () => {
    const catalog = sourceCatalog.find((source) => source.slug === "lovable-changelog");
    expect(catalog).toMatchObject({ adapter: "rss", lifecycleStatus: "shadow", enabled: false });
    const result = await rssAdapter.collect(
      descriptor(catalog),
      context(await fixture("lovable-changelog.xml"), catalog?.endpoint ?? ""),
    );
    expect(result[0]).toMatchObject({
      title: "Add payments to your app",
      publishedAt: "2026-04-24T00:00:00.000Z",
    });
  });

  it("keeps source schema drift out of normalized signals", async () => {
    const drift = await fixture("source-schema-drift.xml");
    const lovable = sourceCatalog.find((source) => source.slug === "lovable-changelog");
    const a2a = sourceCatalog.find((source) => source.slug === "a2a-protocol-releases");

    expect(
      await rssAdapter.collect(descriptor(lovable), context(drift, lovable?.endpoint ?? "")),
    ).toEqual([]);
    await expect(
      githubReleasesAdapter.collect(descriptor(a2a), context(drift, a2a?.endpoint ?? "")),
    ).rejects.toThrow("no entries found");
  });

  it.each([
    "baoyu",
    "mu-li-blog",
    "lilian-weng",
    "eugene-yan",
  ])("parses the %s expert feed through the RSS contract", async (slug) => {
    const catalog = sourceCatalog.find((source) => source.slug === slug);
    expect(catalog).toMatchObject({ adapter: "rss", role: "expert", lifecycleStatus: "shadow" });
    const result = await rssAdapter.collect(
      descriptor(catalog),
      context(await fixture("expert-feed.xml"), catalog?.endpoint ?? ""),
    );
    expect(result[0]?.title).toBe("A durable AI systems field note");
  });
});

function event(
  slug: string,
  happenedAt: string,
  evidenceItems: EnrichedEvent["evidence"],
): EnrichedEvent {
  return {
    id: slug,
    slug,
    title: slug,
    factSummary: "Verified fact",
    summary: "Context",
    technicalInsight: "Technical change",
    industryInsight: "Industry impact",
    futureOutlook: "Next signal",
    businessValue: "Decision value",
    category: "product",
    company: "Example",
    keywords: [],
    confidenceScore: 80,
    heatScore: 60,
    impactScore: 70,
    valueScore: 75,
    scoreFactors: {
      authority: 80,
      corroboration: 70,
      primaryEvidence: 1,
      uniqueAuthors: 1,
      independentSources: 1,
      platformBreadth: 1,
      regionBreadth: 1,
      velocity: 1,
      freshness: 1,
      crossRegion: false,
    },
    featured: false,
    happenedAt,
    publishedAt: happenedAt,
    evidence: evidenceItems,
    tracks: [],
    actors: [],
  };
}

function evolutionModel(): StaticSiteModel {
  const model = embodiedSiteModel();
  const template = model.embodiedEvents[0];
  if (!template) throw new Error("Missing embodied Event fixture");
  model.embodiedEvents = embodiedLaunchEvents.map((event) => ({
    ...template,
    slug: event.slug,
    title: event.title,
    happenedAt: event.date,
    publishedAt: event.date,
    dataProfile: event.dataProfile,
    pipelineStages: event.dataProfile.pipelineStages,
  }));
  const narrative = buildPublicEmbodiedNarrative(
    model.embodiedEvents,
    evolutionPhases,
    embodiedTrends,
  );
  model.evolutionPhases = narrative.phases;
  model.embodiedTrends = narrative.trends;
  return model;
}

function embodiedSiteModel(): StaticSiteModel {
  const legacyEvent = event("embodied-event", "2026-09-20T00:00:00.000Z", [
    evidence("Primary evidence", "primary", "2026-09-20T00:00:00.000Z"),
  ]);
  const primaryEvidence = legacyEvent.evidence[0];
  if (!primaryEvidence) throw new Error("Primary evidence fixture is missing");
  primaryEvidence.url = "https://example.com/evidence";
  primaryEvidence.source = "Example Lab";
  const { id: _id, actors: _actors, ...publicEvent } = legacyEvent;
  const pipelineStages = [
    [
      "demand-definition",
      "需求与任务定义",
      "Demand and task definition",
      "Decide what data to collect and why.",
      "01",
    ],
    [
      "acquisition-route",
      "采集技术路线",
      "Acquisition route",
      "Compare collection and production routes.",
      "02",
    ],
    [
      "multimodal-capture",
      "多模态采集设备",
      "Multimodal capture",
      "Track synchronized multimodal capture.",
      "03",
    ],
    [
      "production-operations",
      "生产运营与成本",
      "Production operations and cost",
      "Track throughput, cost, and delivery.",
      "04",
    ],
    [
      "data-engineering-standards",
      "数据工程与标准",
      "Data engineering and standards",
      "Track formats and governance standards.",
      "05",
    ],
    [
      "quality-training-feedback",
      "质量验收与训练反馈",
      "Quality acceptance and training feedback",
      "Feed evaluation results into collection.",
      "06",
    ],
  ].map(([slug, name, nameEn, descriptionEn, icon], order) => ({
    slug,
    name,
    description: `${name}说明`,
    nameEn,
    descriptionEn,
    color: "#345",
    icon,
    order,
    milestones:
      slug === "acquisition-route"
        ? [
            {
              eventSlug: "embodied-event",
              title: "embodied-event",
              happenedAt: "2026-09-20T00:00:00.000Z",
              deliveryImpact:
                "Defines the production and acceptance boundary for a robot data run.",
              evidenceStatus: "verified",
              evidence: legacyEvent.evidence,
            },
          ]
        : [],
    peerComparisons:
      slug === "acquisition-route"
        ? [
            {
              peerSlug: "example-lab",
              peerName: "Example Lab",
              claimText: "Publishes a sourced teleoperation collection method.",
              verificationStatus: "independently-verified",
              sourceUrl: "https://example.com/lab/evidence",
            },
          ]
        : [],
    counterEvidence: [],
    nextSignals:
      slug === "acquisition-route"
        ? [{ eventSlug: "embodied-event", eventTitle: "embodied-event", signal: "Next signal" }]
        : [],
  }));
  return {
    siteUrl: "https://example.com/",
    generatedAt: "2026-09-20T00:00:00.000Z",
    events: [legacyEvent],
    tracks: pipelineStages.map((stage) => ({
      ...stage,
      kind: "pipeline",
      perspective: "production",
    })),
    actors: [],
    resources: [],
    sources: [
      {
        slug: "example-source",
        name: "Example Source",
        homepageUrl: "https://example.com/source",
        category: "official",
        region: "CN",
        tier: 1,
        role: "official",
        acquisition: "rss",
        topics: ["embodied-data"],
        mapStatus: "pending",
        pipelineStages: ["acquisition-route"],
        substituteFor: [],
        restrictionNote: "",
        maintenanceStatus: "maintained",
        lifecycle: "shadow",
        observationEnabled: false,
        qualityScore: 90,
        cadence: "weekly",
        healthStatus: "healthy",
        lastCheckedAt: null,
        latestItemAt: null,
        healthErrorCode: null,
      },
    ],
    signals: [],
    influencers: [],
    scout: [],
    narratives: { horizon: { start: "2026", end: "2026", label: "2026" }, eras: [], tracks: [] },
    product: {
      version: "0.12.0",
      generatedAt: "2026-09-20T00:00:00.000Z",
      capabilities: [],
      roadmap: [],
      releases: [],
      evaluation: null,
      sourceCoverage: {
        total: 1,
        active: 0,
        observing: 0,
        candidate: 1,
        regions: ["CN"],
        categories: ["official"],
      },
    },
    github: {
      repositoryUrl: "https://github.com/example/agent-pulse",
      stars: 1,
      forks: 0,
      openIssues: 0,
      latestRelease: "v0.12.0",
      fetchedAt: null,
    },
    embodiedEvents: [
      {
        ...publicEvent,
        pipelineStages: ["acquisition-route"],
        dataProfile: {
          pipelineStages: ["acquisition-route"],
          scenarios: ["tabletop manipulation"],
          embodiments: ["single-arm"],
          tasks: ["manipulation"],
          modalities: ["rgb", "action"],
          acquisitionMethods: ["teleoperation"],
          dataFormats: ["RLDS"],
          standards: ["RLDS"],
          scaleClaims: [],
          qualityMetrics: ["task completion"],
          costSignals: [],
          deliveryImpact: "Defines the production and acceptance boundary for a robot data run.",
          evidenceStatus: "verified",
        },
        datasets: [{ slug: "droid", title: "DROID", role: "release" }],
        standards: [],
        collectionMethods: [
          { slug: "teleoperation", title: "Robot teleoperation", role: "demonstration" },
        ],
        peers: [{ slug: "example-lab", title: "Example Lab", role: "claim" }],
      },
    ],
    pipelineStages,
    datasets: [],
    standards: [],
    collectionMethods: [],
    peers: [
      {
        slug: "example-lab",
        name: "Example Lab",
        actorType: "lab",
        region: "CN",
        websiteUrl: "https://example.com/lab",
        capabilities: [
          {
            capabilityKey: "teleoperation-collection",
            pipelineStages: ["acquisition-route"],
            claimText: "Publishes a sourced teleoperation collection method.",
            claimant: "independent",
            sourceUrl: "https://example.com/lab/evidence",
            claimedAt: "2026-09-20T00:00:00.000Z",
            verificationStatus: "independently-verified",
            verifiedAt: "2026-09-20T00:00:00.000Z",
            confidence: 90,
            limitations: [],
            evidence: [{ slug: "embodied-event", title: "Embodied event", role: "verification" }],
          },
        ],
      },
    ],
    evolutionPhases: [],
    embodiedTrends: [],
    sourceCoverageGaps: [],
  } as StaticSiteModel;
}

function researchEvent(slug: string, happenedAt: string): EnrichedEvent {
  const primary = evidence("Research preprint", "primary", happenedAt);
  primary.url = `https://arxiv.org/abs/${slug}`;
  return {
    ...event(slug, happenedAt, [primary]),
    category: "research-paper",
    confidenceScore: 88,
    impactScore: 84,
    valueScore: 82,
    technicalInsight:
      "The paper defines a reproducible method, comparison baseline, evaluation protocol, and measurable result that changes a technical capability boundary.",
    industryInsight:
      "The result can change product architecture, evaluation practice, and the competitive position of teams building in this domain.",
    futureOutlook:
      "Watch independent reproduction, deployment cost, failure cases, and whether the result transfers to real production workloads.",
    researchImpact: {
      eventSlug: slug,
      arxivId: "2607.00001",
      paperTitle: slug,
      openAlexId: "https://openalex.org/W1",
      citedByCount: 240,
      recentCitations: 90,
      titleMatchScore: 1,
      topicRelevant: true,
      publicationDate: happenedAt.slice(0, 10),
      publicationDateDeltaDays: 0,
      qualified: true,
      route: "established-field-impact",
      reasons: ["test_fixture"],
      evidenceUrls: ["https://openalex.org/W1"],
    },
  };
}

function evidence(
  title: string,
  role: string,
  publishedAt: string,
): EnrichedEvent["evidence"][number] {
  return {
    title,
    role,
    publishedAt,
    source: `${title} source`,
    url: `https://example.com/${title.toLowerCase().replaceAll(" ", "-")}`,
  };
}

function stage(start: string, end: string): NarrativeStage {
  return {
    start,
    end,
    period: `${start} — ${end}`,
    label: "Stage",
    summary: "Summary",
    interpretation: "Interpretation",
    chinaPosition: "China position",
    nextSignal: "Next signal",
  };
}

function source(
  slug: string,
  name: string,
  healthStatus: PublicSource["healthStatus"],
  acquisition: string,
  topics: string[],
): PublicSource {
  return {
    slug,
    name,
    homepageUrl: `https://example.com/${slug}`,
    category: "agent-devtool",
    region: "GLOBAL",
    tier: 1,
    role: "primary",
    acquisition,
    topics,
    mapStatus: "pending",
    pipelineStages: [],
    substituteFor: [],
    restrictionNote: "",
    maintenanceStatus: "candidate",
    lifecycle: "shadow",
    observationEnabled: false,
    qualityScore: 80,
    cadence: "daily",
    healthStatus,
    lastCheckedAt: healthStatus === "unchecked" ? null : "2026-07-12T00:00:00Z",
    latestItemAt: healthStatus === "healthy" ? "2026-07-11T00:00:00Z" : null,
    healthErrorCode: healthStatus === "failed" ? "INVALID_ITEMS" : null,
  };
}

function descriptor(source: (typeof sourceCatalog)[number] | undefined): SourceDescriptor {
  if (!source) throw new Error("Expected source fixture entry");
  return {
    id: source.slug,
    slug: source.slug,
    name: source.name,
    homepageUrl: source.homepageUrl,
    adapter: source.adapter,
    tier: source.tier,
    role: source.role,
    region: source.region,
    language: source.language,
    authorityScore: source.authorityScore,
    config: { url: source.endpoint, category: source.category, take: 10 },
    state: {},
  };
}

function context(body: string, finalUrl: string): CollectContext {
  return {
    config: {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: 8899,
      DATABASE_URL: "sqlite::memory:",
      COLLECTOR_USER_AGENT: "agent-pulse/test",
      COLLECTOR_TIMEOUT_MS: 30_000,
      COLLECTOR_CONCURRENCY: 4,
      COLLECTOR_PROXY_MODE: "off",
      PUBLIC_SITE_URL: "https://example.com",
      DEEPSEEK_BASE_URL: "https://api.deepseek.com",
      DEEPSEEK_MODEL: "deepseek-v4-flash",
      AI_ENRICHMENT_ENABLED: false,
      AI_ENRICHMENT_MAX_EVENTS: 8,
      AI_ENRICHMENT_TIMEOUT_MS: 60_000,
      AI_STAGE_PROMOTION_ENABLED: false,
      DEEPSEEK_STAGE_MODEL: "deepseek-v4-pro",
      AI_STAGE_PROMOTION_TIMEOUT_MS: 120_000,
      rootDir: "/tmp",
      databaseUrl: "sqlite::memory:",
      distDir: "/tmp/dist",
    },
    fetchText: async () => ({
      body,
      status: 200,
      headers: new Headers(),
      attemptCount: 1,
      responseBytes: body.length,
      finalUrl,
    }),
  };
}

async function fixture(name: string): Promise<string> {
  return readFile(join(process.cwd(), "tests/fixtures/sources", name), "utf8");
}
