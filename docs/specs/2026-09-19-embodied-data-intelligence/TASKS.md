# TASKS：具身数据认知系统领域基础

只有对应代码、测试、验证结果和提交均存在时才能勾选。

- [x] Task 1：隔离 Scout 多样性测试与动态 seed 数据的耦合（`ed34079`）。
- [x] Task 2：建立 PRD、SYSTEM、TEST、TASKS 和实施计划关联（`b24058e`）。
- [x] Task 3：增加具身数据受控词表与严格 DataProfile Schema（`9468aa3`）。
- [x] Task 4：增加 scope 列、DataProfile 表和数据库类型（`a8234b8`）。
- [x] Task 5：增加 Repository 契约与快照 round-trip（`a58d655`）。
- [x] Task 6：增加九个相关性 golden cases 与确定性评估（`c1b18e9`）。
- [x] Task 7：增加只读双跑预览和 CLI（`6f98180`）。
- [x] Task 8：同步双 Changelog，完成目标测试、全量检查与 build（本文件所在提交）。

## 公开切换 Phase 3—5

- [x] Phase 3：建立具身来源目录、36 个发布 Event、12 个 Dataset、4 个 Standard、6 个 CollectionMethod 与 15 个同行能力档案。
- [x] Phase 4：将当前快照和运行时切换到具身数据 scope，增加相关性、证据、冲突、readiness 和自动发布硬门禁，并持久化 `readiness_blockers_json`。
- [x] Phase 5：只导出 7 份 allowlist DTO，替换为具身数据路由与六阶段视觉系统，并同步 SEO、JSON-LD、Sitemap、RSS、`llms.txt` 和公开内容指纹。
- [x] Phase 5：同步仓库与网站 `[Unreleased]` 记录、包元数据、README、fork 仓库链接和机器验收报告，不提升版本号。
- [x] Phase 5：在 390px 与 1280px 下完成首页、管线、资产、同行、来源、Scout、Event、英文首页和 404 页面浏览器验收。

## 公开切换验收证据

2026-09-20 本地验收结果记录于 `data/reports/embodied-data-public-switch.json`：

- `npm run check` 通过：77 个测试文件、516 个测试通过；lint 保留 1 个既存的非阻断 CSS `!important` warning，typecheck、导出和公开完整性验证通过。
- `npm run build` 与 `npm run db:snapshot -- restore` 通过；快照 SHA-256 为 `e71bf0cfef071855bb057664d9439c91dd8e9c98721e26a849b810302dacac06`。
- `npm run public:validate` 通过且 `issues` 为空；公开指纹为 `19fae253c278d81bbc4d09da78633d9043ea7389a1a3d96d82a6f82209331708`。
- 36 个 Event 均绑定一手证据和 verified DataProfile；六阶段各覆盖 6 个 Event。22 个数据资产、15 个同行能力声明、36 个来源和 7 条 Scout 建议的公开证据链接覆盖率均为 100%。
- 36 个公开来源全部保持 `shadow`，未宣称 active 生产采集或 MySQL 兼容；公开产物的旧通用 AI framing 与旧路由泄漏文件数为 0。
- 390px 与 1280px 的 9 个目标页面均无横向溢出；键盘跳转、减少动效规则、外部证据链接及 `susuyan/eai-pulse` 仓库链接均已复验。

## 完成证据

2026-09-19 完成首个领域基础包验证：

- 目标测试：`npm test -- --run tests/scout.test.ts tests/embodied-data-domain.test.ts tests/embodied-data-schema.test.ts tests/embodied-data-relevance.test.ts tests/snapshot.test.ts tests/embodied-data-preview.test.ts`，6 个文件、28 个测试通过。
- 全量检查：`npm run check` 通过；58 个测试文件、357 个测试通过，静态导出和公开站校验通过。保留 1 个既存的非阻断 CSS `!important` lint warning。
- 构建：`npm run build` 通过。
- 私有预览：`npm run preview:embodied` 写入被 Git 忽略的 `var/embodied-data-preview.json`；共 4,128 个候选，`include 56 / review 129 / reject 3,943 / profiled 0`。
- 当时边界（2026-09-19）：未切换公开站内容方向，未修改 `data/snapshot/v1.json`，未删除或重标记当前 Event、Signal、Source 和 Actor 数据，未改变发布门禁；该私有基础边界随后由已批准的 Phase 3—5 公开切换取代。
- 提交：Task 2 `b24058e`、Task 3 `9468aa3`、Task 4 `a8234b8`、Task 5 `a58d655`、Task 6 `c1b18e9`、Task 7 `6f98180`；Task 8 为本文件所在提交，其哈希通过最终 `git log` 验证，避免在提交内容中写入不可稳定的自引用哈希。
