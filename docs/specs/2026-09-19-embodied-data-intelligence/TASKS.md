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

## 完成证据

2026-09-19 完成首个领域基础包验证：

- 目标测试：`npm test -- --run tests/scout.test.ts tests/embodied-data-domain.test.ts tests/embodied-data-schema.test.ts tests/embodied-data-relevance.test.ts tests/snapshot.test.ts tests/embodied-data-preview.test.ts`，6 个文件、28 个测试通过。
- 全量检查：`npm run check` 通过；58 个测试文件、357 个测试通过，静态导出和公开站校验通过。保留 1 个既存的非阻断 CSS `!important` lint warning。
- 构建：`npm run build` 通过。
- 私有预览：`npm run preview:embodied` 写入被 Git 忽略的 `var/embodied-data-preview.json`；共 4,128 个候选，`include 56 / review 129 / reject 3,943 / profiled 0`。
- 边界确认：未切换公开站内容方向，未修改 `data/snapshot/v1.json`，未删除或重标记当前 Event、Signal、Source 和 Actor 数据，未改变发布门禁。
- 提交：Task 2 `b24058e`、Task 3 `9468aa3`、Task 4 `a8234b8`、Task 5 `a58d655`、Task 6 `c1b18e9`、Task 7 `6f98180`；Task 8 为本文件所在提交，其哈希通过最终 `git log` 验证，避免在提交内容中写入不可稳定的自引用哈希。
