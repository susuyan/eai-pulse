import { describe, expect, it } from "vitest";
import { renderStaticPages } from "../src/pipeline/static-site/pages.js";
import { pageLayout, serializeJsonLd } from "../src/pipeline/static-site/render.js";
import { embodiedSiteModel } from "./fixtures/embodied-site-model.js";

describe("static site SEO serialization", () => {
  it("identifies the evolution timeline in both locale metadata and canonical routes", () => {
    const pages = renderStaticPages(embodiedSiteModel());
    for (const [prefix, title] of [
      ["", "具身数据发展脉络"],
      ["en/", "Embodied Data Evolution"],
    ]) {
      const html =
        pages.find((page) => page.path === `${prefix}timeline/index.html`)?.content ?? "";
      expect(html).toContain(`<title>${title} · Agent Pulse</title>`);
      expect(html).toContain(`rel="canonical" href="https://example.com/${prefix}timeline/"`);
      expect(html).not.toContain("/lines/");
      const schema = [
        ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
      ].map((match) => JSON.parse(match[1] ?? "{}"));
      expect(schema).toEqual(
        expect.arrayContaining([expect.objectContaining({ "@type": "CollectionPage" })]),
      );
    }
  });
  it("keeps JSON-LD parseable while neutralizing script boundaries", () => {
    const value = {
      "@context": "https://schema.org",
      name: 'Evidence "quoted" </script><script>alert(1)</script>',
      separator: "line\u2028break",
    };
    const serialized = serializeJsonLd(value);

    expect(JSON.parse(serialized)).toEqual(value);
    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script>");
    expect(serialized).toContain("\\u003c");
  });

  it("renders valid page and custom structured-data blocks", () => {
    const html = pageLayout({
      title: "Test page · Agent Pulse",
      description: "A unique test description.",
      route: "/events/test/",
      depth: 2,
      active: "timeline",
      body: "<article><h1>Test</h1></article>",
      siteUrl: "https://example.com/agent-pulse/",
      github: {
        repositoryUrl: "https://github.com/barretlee/agent-pulse",
        stars: 1,
        forks: 0,
        openIssues: 0,
        latestRelease: "v0.11.0",
        fetchedAt: "2026-07-14T00:00:00.000Z",
      },
      generatedAt: "2026-07-14T00:00:00.000Z",
      locale: "zh-CN",
      ogType: "article",
      jsonLd: [{ "@context": "https://schema.org", "@type": "Article", headline: "Test" }],
    });
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => JSON.parse(block[1] ?? ""))).toMatchObject([
      { "@type": "WebPage" },
      { "@type": "Article", headline: "Test" },
    ]);
    expect(html).toContain('<meta property="og:type" content="article">');
    expect(html).toContain('<meta name="twitter:card" content="summary">');
  });

  it("publishes only supported embodied-data structured claims", () => {
    const pages = renderStaticPages(embodiedSiteModel());
    const jsonLd = (path: string) =>
      [
        ...(pages.find((page) => page.path === path)?.content ?? "").matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((match) => JSON.parse(match[1] ?? "{}"));

    expect(jsonLd("index.html").map((item) => item["@type"])).toEqual([
      "WebPage",
      "WebSite",
      "Organization",
    ]);
    expect(jsonLd("pipeline/index.html").map((item) => item["@type"])).toContain("CollectionPage");
    expect(jsonLd("events/embodied-event/index.html")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "@type": "Article",
          headline: "embodied-event",
          mainEntityOfPage: "https://example.com/events/embodied-event/",
        }),
      ]),
    );
  });
});
