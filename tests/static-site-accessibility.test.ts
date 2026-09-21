import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { embodiedLaunchEvents } from "../src/catalog/embodied-data/events.js";
import { embodiedTrends, evolutionPhases } from "../src/catalog/embodied-data/evolution.js";
import { buildPublicEmbodiedNarrative } from "../src/pipeline/static-site/embodied-narrative.js";
import { renderStaticPages } from "../src/pipeline/static-site/pages.js";
import { embodiedSiteModel } from "./fixtures/embodied-site-model.js";

const root = process.cwd();

describe("embodied public-site accessibility", () => {
  const pages = renderStaticPages(embodiedSiteModel());
  const page = (path: string) => pages.find((item) => item.path === path)?.content ?? "";

  it("keeps one main landmark and a keyboard-visible skip link on every page", () => {
    for (const item of pages) {
      expect(item.content.match(/<main\b/g)).toHaveLength(1);
      expect(item.content).toContain('<a class="skip-link" href="#main">');
      expect(item.content).toContain('<main id="main">');
    }
  });

  it("preserves the complete six-stage pipeline as ordered no-JS content", () => {
    const home = page("index.html");
    const pipeline = page("pipeline/index.html");
    expect(home).toContain('<ol class="pipeline-rail"');
    expect(pipeline).toContain('<ol class="pipeline-stage-list"');
    for (const stage of embodiedSiteModel().pipelineStages) {
      expect(home).toContain(`data-pipeline-stage="${stage.slug}"`);
      expect(pipeline).toContain(`id="${stage.slug}"`);
      expect(pipeline).toContain(`data-pipeline-stage="${stage.slug}"`);
      expect(pipeline).toContain(stage.description);
    }
  });

  it("keeps all trend articles readable with labeled headings and a polite daily status", () => {
    const model = embodiedSiteModel();
    const template = model.embodiedEvents[0];
    if (!template) throw new Error("Missing Event fixture");
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
    const home = renderStaticPages(model).find((item) => item.path === "index.html")?.content ?? "";
    expect(home).toContain('aria-labelledby="home-trends-title"');
    expect(home).toContain('<h2 id="home-trends-title">');
    expect(home).toMatch(/<p[^>]*data-trend-status[^>]*role="status"[^>]*aria-live="polite"/);
    expect(home).toContain("策展目录顺序");
    const cards = [
      ...home.matchAll(/<article[^>]*data-embodied-trend="([^"]+)"[\s\S]*?<\/article>/g),
    ];
    expect(cards).toHaveLength(8);
    expect(cards[0]?.[1]).toBe("teleoperation-and-human-demonstrations");
    for (const [index, card] of cards.entries()) {
      expect(card[0]).toContain(`aria-labelledby="trend-${index}-title"`);
      expect(card[0]).toContain(`<h3 id="trend-${index}-title">`);
      expect(card[0]).toContain("<h4>");
      expect(card[0]).not.toMatch(/\bhidden\b|aria-hidden="true"|<template|<details/);
    }
  });

  it("provides labeled progressive controls without withholding server-rendered content", () => {
    const timeline = page("timeline/index.html");
    expect(timeline).toContain('data-evolution-filters hidden role="group"');
    expect(timeline).toContain('aria-label="聚焦管线阶段"');
    expect(timeline.match(/data-evolution-stage-filter="/g)).toHaveLength(7);
    expect(timeline).toContain('data-evolution-stage-filter="all" aria-pressed="true"');
    expect(timeline).toContain("data-evolution-event-index");
    expect(timeline).not.toContain("<template");
  });

  it("filters only impact cells and restores them with Escape while arrows move focus", async () => {
    const module = await import(pathToFileURL(join(root, "web/public/assets/timeline.js")).href);
    expect(typeof module.setupEmbodiedEvolutionTimeline).toBe("function");
    let focused: Control | undefined;
    class Control extends EventTarget {
      hidden = false;
      attributes = new Map<string, string>();
      constructor(readonly dataset: Record<string, string> = {}) {
        super();
      }
      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
      }
      focus() {
        focused = this;
      }
    }
    const filters = new Control();
    filters.hidden = true;
    const buttons = ["all", "demand-definition", "acquisition-route"].map(
      (stage) => new Control({ evolutionStageFilter: stage }),
    );
    const cells = [
      "demand-definition",
      "acquisition-route",
      "demand-definition",
      "acquisition-route",
    ].map((stage) => new Control({ evolutionStage: stage }));
    const rootNode = Object.assign(new Control(), {
      querySelector: (selector: string) =>
        selector === "[data-evolution-filters]" ? filters : null,
      querySelectorAll: (selector: string) =>
        selector === "[data-evolution-stage-filter]"
          ? buttons
          : selector === "[data-evolution-stage]"
            ? cells
            : [],
    });
    module.setupEmbodiedEvolutionTimeline(rootNode);
    expect(filters.hidden).toBe(false);
    buttons[2]?.dispatchEvent(new Event("click"));
    expect(cells.map((cell) => cell.hidden)).toEqual([true, false, true, false]);
    expect(buttons.map((button) => button.attributes.get("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    const key = (value: string) =>
      Object.assign(new Event("keydown", { cancelable: true }), { key: value });
    buttons[2]?.dispatchEvent(key("ArrowRight"));
    expect(focused).toBe(buttons[0]);
    buttons[0]?.dispatchEvent(key("ArrowLeft"));
    expect(focused).toBe(buttons[2]);
    rootNode.dispatchEvent(key("Escape"));
    expect(cells.every((cell) => !cell.hidden)).toBe(true);
    expect(buttons[0]?.attributes.get("aria-pressed")).toBe("true");
    expect(focused).toBe(buttons[0]);
    expect(() => module.setupEmbodiedEvolutionTimeline(null)).not.toThrow();
  });

  it("renders the peer matrix as a labeled semantic table", () => {
    const peers = page("peers/index.html");
    expect(peers).toMatch(/<table class="peer-matrix"><caption>[^<]+<\/caption>/);
    expect(peers.match(/<th scope="col">/g)?.length).toBe(5);
    expect(peers).toMatch(/<tbody>(?:.|\n)*<th scope="row">/);
  });

  it("gives source and evidence links readable names", () => {
    for (const path of ["index.html", "peers/index.html", "sources/index.html"]) {
      const externalLinks = [
        ...page(path).matchAll(/<a\b([^>]*)target="_blank"([^>]*)>([\s\S]*?)<\/a>/g),
      ];
      expect(externalLinks.length).toBeGreaterThan(0);
      for (const match of externalLinks) {
        const attributes = `${match[1] ?? ""}${match[2] ?? ""}`;
        const visibleText = match[3]?.replace(/<[^>]+>/g, "").trim() ?? "";
        expect(visibleText || attributes.match(/aria-label="([^"]+)"/)?.[1]).toBeTruthy();
      }
    }
  });

  it("defines stage tokens, visible focus, reduced motion, and responsive rails", async () => {
    const css = await readFile(join(root, "web/public/assets/app.css"), "utf8");
    for (const token of [
      "--pipeline-demand",
      "--pipeline-route",
      "--pipeline-capture",
      "--pipeline-operations",
      "--pipeline-engineering",
      "--pipeline-feedback",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toMatch(/:(?:focus-visible)[^{]*\{[^}]*outline:/s);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".pipeline-rail");
    expect(css).toContain(".peer-matrix-wrap");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("@media (max-width: 820px)");
  });

  it("adds optional keyboard-safe stage focus without hiding no-JS content", async () => {
    const core = await readFile(join(root, "web/public/assets/core.js"), "utf8");
    const timeline = await readFile(join(root, "web/public/assets/timeline.js"), "utf8");
    expect(core).toContain("setupPipelineFocus");
    expect(core).toContain('event.key === "Escape"');
    expect(core).toContain("aria-current");
    expect(timeline).toContain("prefers-reduced-motion: reduce");
    expect(core).not.toContain('style.display = "none"');
  });
});
