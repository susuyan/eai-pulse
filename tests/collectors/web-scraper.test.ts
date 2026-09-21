import { beforeAll, describe, expect, it } from "vitest";
import type { CollectContext, SourceAdapter } from "../../src/collectors/types.js";
import type { SourceDescriptor } from "../../src/domain/types.js";

let adapter: SourceAdapter;
beforeAll(async () => {
  const mod = await import("../../src/collectors/web-scraper.js");
  adapter = mod.webScraperAdapter;
});

function makeContext(body: string, status = 200, finalUrl = "https://example.com"): CollectContext {
  return {
    config: {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: 8899,
      DATABASE_URL: "sqlite::memory:",
      COLLECTOR_USER_AGENT: "test",
      COLLECTOR_TIMEOUT_MS: 30000,
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
      status,
      headers: new Headers(),
      attemptCount: 1,
      responseBytes: body.length,
      finalUrl,
    }),
  };
}

function makeSource(overrides?: Partial<SourceDescriptor>): SourceDescriptor {
  return {
    id: "test",
    slug: "test-site",
    name: "Test Site",
    homepageUrl: "https://example.com",
    adapter: "web-scraper",
    tier: 2,
    role: "media",
    region: "GLOBAL",
    language: "en",
    authorityScore: 70,
    config: { url: "https://example.com", category: "tech", take: 30 },
    state: {},
    ...overrides,
  };
}

describe("web-scraper adapter", () => {
  it("rejects malformed discovered XML instead of extracting apparently complete items", async () => {
    const page =
      '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body><nav>Undated navigation</nav></body></html>';
    const xml =
      "<rss><channel><item><title>Broken feed</title><link>https://example.com/one</link><pubDate>Fri, 03 Jul 2026 08:00:00 GMT</pubDate></item></rss>";
    const context = makeContext(page);
    context.fetchText = async (url) => ({
      body: url.endsWith("feed.xml") ? xml : page,
      status: 200,
      finalUrl: url,
      headers: new Headers(),
      attemptCount: 1,
      responseBytes: 0,
    });
    await expect(adapter.collect(makeSource(), context)).rejects.toThrow(/XML/);
  });
  const configured = () =>
    makeSource({
      config: {
        url: "https://example.com",
        html: {
          records: ".record",
          title: { selector: ".headline" },
          link: { selector: "a", attribute: "href" },
          date: { selector: ".published", format: "ymd", semantic: "published" },
        },
      } as SourceDescriptor["config"],
    });
  const record =
    '<div class="record"><div><a href="/one"><span class="headline">A real item</span></a></div><div><span class="published">2026.07.03</span></div></div>';

  it("binds configured nested fields within each record and deduplicates canonical URLs", async () => {
    const items = await adapter.collect(configured(), makeContext(record + record));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "A real item",
      url: "https://example.com/one",
      publishedAt: "2026-07-03T00:00:00.000Z",
      rawMeta: { dateInferred: false, dateSemantic: "published", datePrecision: "day" },
    });
  });
  it.each([
    "",
    "07-03",
    "2026-02-30",
    "not a date",
  ])("fails closed on configured missing or invalid dates: %s", async (date) => {
    await expect(
      adapter.collect(configured(), makeContext(record.replace("2026.07.03", date))),
    ).rejects.toThrow();
  });
  it("does not borrow a date from an adjacent record or navigation", async () => {
    const html =
      record.replace('<span class="published">2026.07.03</span>', "") +
      '<nav><a href="/about">About us</a><time>2026-07-03</time></nav><div class="record"><span class="published">2026-07-03</span></div>';
    await expect(adapter.collect(configured(), makeContext(html))).rejects.toThrow();
  });
  it("does not borrow a nested record's date for an undated outer record", async () => {
    const html =
      '<div class="record"><div><a href="/outer"><span class="headline">Outer item</span></a></div><div class="record"><div><span class="published">2026-07-03</span></div></div></div>';
    await expect(adapter.collect(configured(), makeContext(html))).rejects.toThrow(
      /no valid dated records/,
    );
  });
  it("excludes nested record text while preserving ordinary nested field wrappers", async () => {
    const html = record.replace(
      "A real item",
      'A real item<div class="record">Unrelated nested text</div>',
    );
    expect((await adapter.collect(configured(), makeContext(html)))[0]?.title).toBe("A real item");
  });
  it.each(
    [undefined, "", "  ", ["first", "second"]].map((slug) => ({ slug })),
  )("rejects missing, blank or non-unique JSON links before prefixing: $slug", async ({ slug }) => {
    const source = makeSource({
      config: {
        url: "https://example.com",
        html: {
          records: "script[type='application/json']",
          jsonPath: "posts.*",
          title: { path: "title" },
          link: { path: "slug.*", prefix: "/posts/" },
          date: { path: "date", format: "iso", semantic: "published" },
        },
      },
    });
    const payload = {
      posts: [
        {
          title: "Dated item",
          date: "2026-07-03T08:00:00Z",
          slug: Array.isArray(slug) ? slug : slug === undefined ? undefined : [slug],
        },
      ],
    };
    const html = `<nav><a href="/posts/">All posts</a></nav><script type="application/json">${JSON.stringify(payload)}</script>`;
    await expect(adapter.collect(source, makeContext(html))).rejects.toThrow(
      /no valid dated records/,
    );
  });
  it("rejects configured external canonical links and final response host changes", async () => {
    await expect(
      adapter.collect(
        configured(),
        makeContext(record.replace("/one", "https://outside.example/one")),
      ),
    ).rejects.toThrow();
    await expect(
      adapter.collect(configured(), makeContext(record, 200, "https://outside.example/")),
    ).rejects.toThrow();
  });
  it("parses only declared embedded JSON records and matches slug URLs to actual page links", async () => {
    const source = makeSource({
      config: {
        url: "https://example.com",
        html: {
          records: "script[type='application/json']",
          jsonPath: "props.posts.*",
          title: { path: "title" },
          link: { path: "slug.current", prefix: "/posts/" },
          date: { path: "date", format: "iso", semantic: "published" },
        },
      } as SourceDescriptor["config"],
    });
    const html =
      '<a href="/posts/first">Read</a><script type="application/json">{"props":{"posts":[{"title":"First","slug":{"current":"first"},"date":"2026-07-03T08:00:00Z"}]}}</script>';
    expect((await adapter.collect(source, makeContext(html)))[0]).toMatchObject({
      title: "First",
      publishedAt: "2026-07-03T08:00:00.000Z",
    });
    await expect(
      adapter.collect(
        source,
        makeContext(html.replace('href="/posts/first"', 'href="/posts/other"')),
      ),
    ).rejects.toThrow();
    await expect(
      adapter.collect(source, makeContext(html.replace('"props"', "broken"))),
    ).rejects.toThrow();
  });
  it("caps same-origin detail requests, preserves date conflicts and leaves state untouched", async () => {
    const source = makeSource({
      config: {
        url: "https://example.com",
        html: {
          records: ".record",
          title: { selector: "a" },
          link: { selector: "a", attribute: "href" },
          detail: {
            take: 2,
            title: { selector: "h1" },
            date: {
              selector: ".date",
              prefix: "Published: ",
              format: "ymd",
              semantic: "published",
            },
            alternateDate: { selector: "meta[name='date']", attribute: "content" },
          },
        },
      } as SourceDescriptor["config"],
      state: { etag: "old" },
    });
    const requests: string[] = [];
    const listing = [1, 2, 3]
      .map((i) => `<div class="record"><a href="/item/${i}">Item ${i}</a></div>`)
      .join("");
    const ctx: CollectContext = {
      ...makeContext(""),
      fetchText: async (url, _headers, policy) => {
        requests.push(url);
        expect(policy).toMatchObject({ allowedOrigin: "https://example.com" });
        const body =
          url === source.config.url
            ? listing
            : '<html><head><meta name="date" content="2026-07-04" /></head><body><h1>Real detail</h1><span class="date">Published: 2026-07-03 10:00</span></body></html>';
        return {
          body,
          status: 200,
          finalUrl: url,
          headers: new Headers(),
          attemptCount: 1,
          responseBytes: body.length,
        };
      },
    };
    const items = await adapter.collect(source, ctx);
    expect(items).toHaveLength(2);
    expect(requests).toEqual([
      "https://example.com",
      "https://example.com/item/1",
      "https://example.com/item/2",
    ]);
    expect(items[0]?.rawMeta).toMatchObject({
      dateConflict: { selected: "Published: 2026-07-03 10:00", alternate: "2026-07-04" },
    });
    expect(source.state).toEqual({ etag: "old" });
  });

  it("fails the source if a later detail drifts after an earlier valid detail", async () => {
    const source = makeSource({
      config: {
        url: "https://example.com",
        html: {
          records: ".record",
          title: { selector: "a" },
          link: { selector: "a", attribute: "href" },
          detail: {
            take: 2,
            title: { selector: "h1" },
            date: { selector: "time", format: "ymd", semantic: "published" },
          },
        },
      },
    });
    const listing =
      '<div class="record"><a href="/one">First</a></div><div class="record"><a href="/two">Second</a></div>';
    const context = makeContext(listing);
    context.fetchText = async (url) => ({
      body:
        url === source.config.url
          ? listing
          : url.endsWith("one")
            ? "<h1>First</h1><time>2026-07-03</time>"
            : "<h1>Second</h1>",
      status: 200,
      finalUrl: url,
      headers: new Headers(),
      attemptCount: 1,
      responseBytes: 100,
    });
    await expect(adapter.collect(source, context)).rejects.toThrow(/detail/i);
  });
  it("has kind web-scraper", () => {
    expect(adapter.kind).toBe("web-scraper");
  });

  it("returns empty for 304", async () => {
    const result = await adapter.collect(makeSource(), makeContext("", 304));
    expect(result).toEqual([]);
  });

  it("extracts articles from <article> tags", async () => {
    const html = `<!DOCTYPE html><html><body>
      <article>
        <h2><a href="/post/1">First Article Title</a></h2>
        <p>This is the summary of the first article with enough content to be meaningful for extraction purposes.</p>
        <time datetime="2026-07-01T10:00:00Z">July 1, 2026</time>
      </article>
      <article>
        <h3><a href="/post/2">Second Article</a></h3>
        <p>Summary of the second article that also has sufficient content for the scraper to pick up and analyze.</p>
        <time datetime="2026-07-02T10:00:00Z">July 2, 2026</time>
      </article>
    </body></html>`;
    const result = await adapter.collect(makeSource(), makeContext(html));
    expect(result.length).toBeGreaterThanOrEqual(1);
    const titles = result.map((r) => r.title);
    expect(titles.some((t) => t.includes("First Article"))).toBe(true);
    expect(result[0]?.url).toBe("https://example.com/post/1");
    expect(result[0]?.rawMeta.dateInferred).toBe(false);
  });

  it("extracts items from listing cards", async () => {
    const html = `<!DOCTYPE html><html><body>
      <div class="post-card">
        <h2><a href="/news/1">Breaking News</a></h2>
        <p>A detailed summary of breaking news that has enough content to be meaningful for the extraction system.</p>
        <time datetime="2026-07-01T10:00:00Z">July 1, 2026</time>
      </div>
      <div class="post-card">
        <h3><a href="/news/2">Update Released</a></h3>
        <p>Details about the update release with sufficient text for the web scraper to extract meaningful information from the page.</p>
        <time datetime="2026-07-02T10:00:00Z">July 2, 2026</time>
      </div>
    </body></html>`;
    const result = await adapter.collect(makeSource(), makeContext(html));
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts dated article links regardless of attribute order or abbreviated month format", async () => {
    const html = `<!DOCTYPE html><html><body>
      <a href="/news/dated-link" class="FeaturedGrid__gridItem">
        <div class="meta"><time>Sep 17 2026</time></div>
        <span class="article-title">A verified product announcement</span>
      </a>
    </body></html>`;

    const result = await adapter.collect(makeSource(), makeContext(html));

    expect(result).toEqual([
      expect.objectContaining({
        title: "A verified product announcement",
        url: "https://example.com/news/dated-link",
        publishedAt: "2026-09-17T00:00:00.000Z",
        rawMeta: expect.objectContaining({ dateInferred: false }),
      }),
    ]);
  });

  it("does not emit cards that have no trusted publication date", async () => {
    const html = `<!DOCTYPE html><html><body>
      <article class="post-card">
        <h2><a href="/news/undated">Undated product announcement</a></h2>
        <p>A navigation card must not be normalized with the collection timestamp.</p>
      </article>
    </body></html>`;

    const result = await adapter.collect(makeSource(), makeContext(html));

    expect(result).toEqual([]);
  });

  it("does not treat an off-site dated link as first-party source content", async () => {
    const html = `<!DOCTYPE html><html><body>
      <a href="https://vendor.example.org/whitepaper.pdf" class="resource-card">
        <time>March 9, 2020</time>
        <span class="resource-title">Vendor whitepaper</span>
      </a>
    </body></html>`;

    const result = await adapter.collect(makeSource(), makeContext(html));

    expect(result).toEqual([]);
  });

  it("extracts explicit human-readable dates from article cards", async () => {
    const html = `<!DOCTYPE html><html><body>
      <article class="post-card">
        <h2><a href="/news/dated">A dated investment perspective</a></h2>
        <p>A substantive first-party article with a date rendered as visible text.</p>
        <div class="post-meta"><span>June 23, 2026</span></div>
      </article>
    </body></html>`;

    const result = await adapter.collect(makeSource(), makeContext(html));

    expect(result[0]?.publishedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(result[0]?.rawMeta.dateInferred).toBe(false);
  });

  it("extracts JSON-LD structured data", async () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": "Structured Data Article",
        "url": "https://example.com/structured",
        "description": "This article uses JSON-LD structured data for rich metadata extraction.",
        "datePublished": "2026-07-05T08:00:00Z",
        "keywords": ["AI", "structured-data", "metadata"]
      }
      </script>
    </head><body></body></html>`;
    const result = await adapter.collect(makeSource(), makeContext(html));
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.title).toBe("Structured Data Article");
    expect(result[0]?.url).toBe("https://example.com/structured");
    expect(result[0]?.tags).toContain("AI");
  });

  it("extracts JSON-LD with @graph", async () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "NewsArticle", "headline": "Graph Article 1", "url": "https://example.com/g1", "description": "First graph article description with details.", "datePublished": "2026-07-05T08:00:00Z" },
          { "@type": "NewsArticle", "headline": "Graph Article 2", "url": "https://example.com/g2", "description": "Second graph article description with details.", "datePublished": "2026-07-06T08:00:00Z" }
        ]
      }
      </script>
    </head><body></body></html>`;
    const result = await adapter.collect(makeSource(), makeContext(html));
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("discovers and follows RSS feed links", async () => {
    const pageHtml = `<!DOCTYPE html><html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
    </head><body></body></html>`;

    const feedXml = `<?xml version="1.0"?>
    <rss version="2.0"><channel>
      <item><title>Feed Item 1</title><link>https://example.com/f1</link><pubDate>Mon, 01 Jul 2026 10:00:00 GMT</pubDate><description>Feed item 1 description.</description></item>
      <item><title>Feed Item 2</title><link>https://example.com/f2</link><pubDate>Tue, 02 Jul 2026 10:00:00 GMT</pubDate><description>Feed item 2 description.</description></item>
    </channel></rss>`;

    // Mock fetchText to return page first, then feed
    let callCount = 0;
    const ctx: CollectContext = {
      config: makeContext("").config,
      fetchText: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            body: pageHtml,
            status: 200,
            headers: new Headers(),
            attemptCount: 1,
            responseBytes: pageHtml.length,
            finalUrl: "https://example.com",
          };
        }
        return {
          body: feedXml,
          status: 200,
          headers: new Headers(),
          attemptCount: 1,
          responseBytes: feedXml.length,
          finalUrl: "https://example.com/feed.xml",
        };
      },
    };

    const result = await adapter.collect(makeSource(), ctx);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("prefers a discovered feed when HTML cards only have inferred dates", async () => {
    const pageHtml = `<!DOCTYPE html><html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
    </head><body><article><h2><a href="/undated">Undated HTML card</a></h2></article></body></html>`;
    const feedXml = `<rss><channel><item><title>Dated feed item</title><link>https://example.com/dated</link><pubDate>Wed, 08 Jul 2026 10:00:00 GMT</pubDate><description>Trusted date.</description></item></channel></rss>`;
    const requests: string[] = [];
    const context = makeContext("");
    context.fetchText = async (url) => {
      requests.push(url);
      const responseBody = requests.length === 1 ? pageHtml : feedXml;
      return {
        body: responseBody,
        status: 200,
        headers: new Headers(),
        attemptCount: 1,
        responseBytes: responseBody.length,
        finalUrl: url,
      };
    };

    const result = await adapter.collect(makeSource(), context);

    expect(requests).toEqual(["https://example.com", "https://example.com/feed.xml"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "Dated feed item",
      publishedAt: "2026-07-08T10:00:00.000Z",
      rawMeta: { source: "discovered-feed", dateInferred: false },
    });
  });

  it("falls back to page meta when no articles found", async () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="Page Meta Title" />
      <meta property="og:type" content="article" />
      <meta property="og:url" content="https://example.com/page" />
      <meta property="og:description" content="This is the meta description of the page used as fallback." />
      <meta property="article:published_time" content="2026-07-10T00:00:00Z" />
      <title>Site Title</title>
    </head><body><p>Just some text, no articles here.</p></body></html>`;
    const result = await adapter.collect(makeSource(), makeContext(html));
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.title).toBe("Page Meta Title");
  });

  it("does not turn a generic marketing homepage into a current news signal", async () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="Company Homepage" />
      <meta property="og:url" content="https://example.com/" />
      <meta property="og:description" content="Build the future with our platform." />
      <title>Company Homepage</title>
    </head><body><main>Products and navigation only.</main></body></html>`;
    const result = await adapter.collect(makeSource(), makeContext(html));
    expect(result).toEqual([]);
  });

  it("throws on empty body", async () => {
    await expect(adapter.collect(makeSource(), makeContext(""))).rejects.toThrow(
      "response body too small",
    );
  });

  it("deduplicates by URL", async () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">
      { "@type": "BlogPosting", "headline": "Same Article", "url": "https://example.com/same", "description": "Duplicate.", "datePublished": "2026-07-05T08:00:00Z" }
      </script>
    </head><body>
      <article><h2><a href="https://example.com/same">Same Article</a></h2><p>Duplicate.</p><time datetime="2026-07-05T08:00:00Z">July 5, 2026</time></article>
    </body></html>`;
    const result = await adapter.collect(makeSource(), makeContext(html));
    const urls = result.map((r) => r.url);
    const sameUrls = urls.filter((u) => u === "https://example.com/same");
    expect(sameUrls.length).toBe(1);
  });

  it("respects take limit", async () => {
    const articles = Array.from(
      { length: 40 },
      (_, i) =>
        `<article><h2><a href="/post/${i}">Article ${i}</a></h2><p>Summary for article ${i} with enough content to be meaningful and extractable.</p><time datetime="2026-07-${String(i + 1).padStart(2, "0")}T00:00:00Z"></time></article>`,
    ).join("");
    const html = `<!DOCTYPE html><html><body>${articles}</body></html>`;
    const result = await adapter.collect(
      makeSource({ config: { url: "https://example.com", take: 5 } }),
      makeContext(html),
    );
    expect(result.length).toBeLessThanOrEqual(5);
  });
});
