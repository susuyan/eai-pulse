import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
