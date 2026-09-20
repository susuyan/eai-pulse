# TASKS：具身数据领域对象

只有对应代码、测试、来源核验、验证结果和提交均存在时才能勾选。

- [x] Task 1：完成第二包 docs-first 规格和实施计划（`99c9c33`）。
- [x] Task 2：核验真实 Dataset、Standard 和 CollectionMethod fixture 来源（`dbae757`）。
- [x] Task 3：增加四类严格领域 Schema 与失败测试（`dbae757`）。
- [x] Task 4：增加八张领域对象表、关系约束和数据库类型（`da1f851`）。
- [x] Task 5：增加 Repository 对象、关系和 PeerCompanyProfile 契约（`a585549`）。
- [x] Task 6：扩展 snapshot round-trip 与旧快照兼容（`eb2e743`）。
- [x] Task 7：完成真实 fixture、级联、幂等和边界测试（`83a8432`）。
- [x] Task 8：同步双 Changelog，完成目标测试、全量检查与 build（本文件所在提交）。

## 完成证据

2026-09-20 完成第二个领域基础包验证：

- 来源核验：3 个 Dataset、3 个 Standard、3 个 CollectionMethod fixture 均通过严格 Schema；12 条 manifest 记录逐项覆盖 fixture，并只使用 2026-09-19 核验的 HTTPS 官方项目、官方文档、官方仓库或原始论文。
- 目标测试：`npm test -- --run tests/embodied-data-domain.test.ts tests/embodied-data-objects-domain.test.ts tests/embodied-data-objects-schema.test.ts tests/snapshot.test.ts`，4 个文件、15 个测试通过。
- 全量检查：`npm run check` 通过；60 个测试文件、368 个测试通过，静态导出和公开站校验通过，公开站校验为 0 issues。保留 1 个既存的非阻断 CSS `!important` lint warning。
- 构建：`npm run build` 通过。
- 快照兼容：schema version 保持 1；8 个新增数组均为可选字段，新对象与 Event/Actor 关系可确定性写入、恢复和幂等重放；删除这些字段的旧 v1 快照恢复后新表保持为空。
- 边界确认：`git diff 5867ad9..HEAD -- data/snapshot/v1.json src/db/seed.ts src/pipeline/export.ts web/public` 和包含工作区的同范围 diff 均为空；fixture 未进入 seed、当前快照、公开 DTO、路由或发布规则。
- 提交：Task 1 `99c9c33`、Task 2-3 `dbae757`、Task 4 `da1f851`、Task 5 `a585549`、Task 6 `eb2e743`、Task 7 `83a8432`；Task 8 为本文件所在提交，避免在提交内容中写入不可稳定的自引用哈希。
