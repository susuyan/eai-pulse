import { describe, expect, it } from "vitest";
import { sourceContractFingerprint } from "../src/domain/source-contract.js";

const contract = {
  adapter: "json-api",
  adapterVersion: "1",
  acquisition: "api",
  language: "en",
  homepageUrl: "https://example.com/",
  config: { url: "https://example.com/releases?take=3", take: 50 },
};

describe("private source contract identity", () => {
  it("preserves the GitHub adapter's open-source category default", () => {
    const github = { ...contract, adapter: "github-releases" };
    expect(sourceContractFingerprint(github)).toBe(
      sourceContractFingerprint({
        ...github,
        config: { ...github.config, category: "open-source" },
      }),
    );
    expect(sourceContractFingerprint(github)).not.toBe(
      sourceContractFingerprint({ ...github, config: { ...github.config, category: "industry" } }),
    );
  });
  it("hashes stable canonical keys, normalized URLs and effective defaults", () => {
    const fingerprint = sourceContractFingerprint(contract);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(
      sourceContractFingerprint({
        ...contract,
        homepageUrl: "https://EXAMPLE.com:443/#home",
        config: { take: 50, url: "https://EXAMPLE.com:443/releases?take=3#ignored" },
      }),
    ).toBe(fingerprint);
    expect(
      sourceContractFingerprint({
        ...contract,
        config: { url: contract.config.url, category: "industry" },
      }),
    ).toBe(fingerprint);
  });

  it.each([
    { adapter: "rss" },
    { adapterVersion: "2" },
    { acquisition: "rss" },
    { language: "zh" },
    { homepageUrl: "https://different.example/" },
    { config: { ...contract.config, take: 1 } },
    { config: { ...contract.config, url: "https://example.com/changed" } },
    { config: { ...contract.config, category: "dataset" } },
    { config: { ...contract.config, dataPath: "response.items" } },
  ])("changes identity when effective contract changes: %j", (change) => {
    expect(sourceContractFingerprint({ ...contract, ...change })).not.toBe(
      sourceContractFingerprint(contract),
    );
  });

  it("binds every nested HTML rule including detail date and limits", () => {
    const html = {
      records: ".card",
      title: { selector: "h2" },
      link: { selector: "a", attribute: "href" },
      detail: {
        take: 2,
        title: { selector: "h1" },
        date: { selector: "time", attribute: "datetime", format: "iso", semantic: "published" },
        alternateDate: { selector: "meta", attribute: "content" },
      },
    };
    const input = {
      ...contract,
      adapter: "web-scraper",
      acquisition: "html",
      config: { ...contract.config, html },
    };
    const fingerprint = sourceContractFingerprint(input);
    for (const detail of [
      { ...html.detail, take: 3 },
      { ...html.detail, date: { ...html.detail.date, semantic: "registered" } },
      { ...html.detail, alternateDate: { selector: ".other" } },
    ])
      expect(
        sourceContractFingerprint({
          ...input,
          config: { ...input.config, html: { ...html, detail } },
        }),
      ).not.toBe(fingerprint);
    expect(
      sourceContractFingerprint({
        ...input,
        config: { ...input.config, html: { ...html, title: { selector: "h3" } } },
      }),
    ).not.toBe(fingerprint);
  });

  it("does not return configuration, credentials or paths in its identity", () => {
    const fingerprint = sourceContractFingerprint({
      ...contract,
      config: {
        ...contract.config,
        url: "https://example.com/releases?token=PRIVATE_SENTINEL&path=/Users/private",
        unknownSecret: "PRIVATE_SENTINEL",
      },
    });
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toMatch(/PRIVATE_SENTINEL|Users|token/);
  });
});
