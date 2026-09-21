import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { releases } from "../src/catalog/product.js";
import { assertReleaseContract, extractReleaseNotes } from "../src/release/changelog.js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const repositoryChangelog = readFileSync(resolve(repositoryRoot, "CHANGELOG.md"), "utf8");
const readme = readFileSync(resolve(repositoryRoot, "README.md"), "utf8");
const packageMetadata = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
) as {
  author: string;
  homepage: string;
  repository: { url: string };
  bugs: { url: string };
};

const changelog = `# Changelog

## [Unreleased]

- Work in progress.

## [0.7.0] - 2026-07-13

### Added

- Autonomous release publishing.

## [0.6.0] - 2026-07-12

- Previous release.
`;

describe("release contract", () => {
  it("extracts only the requested version section", () => {
    expect(extractReleaseNotes(changelog, "0.7.0")).toContain("Autonomous release publishing");
    expect(extractReleaseNotes(changelog, "0.7.0")).not.toContain("Previous release");
  });

  it("requires package, product, website and repository changelog versions to agree", () => {
    expect(() =>
      assertReleaseContract({
        packageVersion: "0.7.0",
        productVersion: "0.7.0",
        changelog,
        websiteVersions: ["0.7.0", "0.6.0"],
      }),
    ).not.toThrow();
    expect(() =>
      assertReleaseContract({
        packageVersion: "0.7.0",
        productVersion: "0.6.0",
        changelog,
        websiteVersions: ["0.6.0"],
      }),
    ).toThrow(/mismatch/);
  });

  it("keeps the embodied-data public switch synchronized across changelogs", () => {
    const unreleased = releases.find((release) => release.version === "unreleased");

    expect(repositoryChangelog).toContain("具身数据生产公开站");
    expect(unreleased?.name).toBe("Embodied Data Public Switch");
    expect(unreleased?.summary).toContain("具身数据生产公开站");
    expect(unreleased?.changes).toContain(
      "当前具身数据目录收录 83 个来源；公开地图为非退休条目展示接入、待接入、受限或替代状态，以及六阶段覆盖和计算出的覆盖缺口。这些目录状态不等同于已完成重点 adapter 接入，也没有来源被描述为 active 生产采集器。",
    );
  });

  it("points package metadata at the maintained deployment", () => {
    expect(packageMetadata.author).toBe("susuyan");
    expect(packageMetadata.homepage).toBe("https://susuyan.github.io/eai-pulse/");
    expect(packageMetadata.repository.url).toBe("git+https://github.com/susuyan/eai-pulse.git");
    expect(packageMetadata.bugs.url).toBe("https://github.com/susuyan/eai-pulse/issues");
  });

  it("documents source lifecycle and database compatibility without overclaiming", () => {
    expect(readme).toContain("All 36 embodied-data sources remain in shadow");
    expect(readme).toContain("MySQL compatibility is not claimed");
    expect(readme).not.toMatch(/\| Active production sources \| [1-9]/i);
  });
});
