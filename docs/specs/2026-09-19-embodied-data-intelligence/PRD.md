# PRD：具身数据认知系统领域基础

## 1. 用户与问题

首要用户是具身数据生产运营团队。系统需要帮助团队判断采集技术路线、数据工程方法和行业标准，并持续观察同行公司的真实能力与行业变化。

首个实施包只建立领域基础和迁移预览，不切换公开站。它需要回答两个工程问题：

1. 当前 Event 是否与具身数据生产全链路相关？
2. 相关 Event 应如何结构化描述其管线阶段、场景、本体、任务、模态、采集方式、标准、规模、质量、成本和交付影响？

## 2. 目标

- 为 Event、Signal、Source 和 Actor 建立可审计的 `content_scope`。
- 为 Event 保存严格校验的具身数据 `DataProfile`。
- 用确定性规则给出 `include`、`review` 或 `reject` 预览建议。
- 用明确的 golden cases 固化收录、复核与拒绝边界。
- 通过私有双跑预览评估现有内容迁移规模，不修改公开 DTO。
- 保证旧快照可以恢复，新领域数据可以确定性写入和恢复。

## 3. 非目标

- 不删除通用 AI 数据。
- 不切换首页、导航、六条主线或 GitHub Pages。
- 不自动发布具身数据 Event。
- 不批量重分类当前 Event、Signal、Source 或 Actor。
- 不建立 Dataset、Standard、CollectionMethod 和 PeerCompanyProfile 的完整产品能力。
- 不宣称 MySQL 兼容。

## 4. 用户流程

1. 开发者恢复当前仓库快照。
2. 私有预览读取 Event，但不修改 Event。
3. 确定性相关性评估输出建议结论、命中的管线阶段和原因码。
4. 已人工确认的 Event 可以单独写入 `content_scope = embodied-data` 与 DataProfile。
5. 快照保存并恢复 scope 与 DataProfile。
6. 公开导出保持现状，直到后续切换规格获得批准。

## 5. 验收标准

- 旧快照可恢复，旧数据缺少 scope 时默认 `legacy-ai`。
- DataProfile 在写入和读取时都通过同一严格 Schema。
- DataProfile 可写入、读取、快照和恢复。
- 九个 golden cases 全部得到预期结论与管线阶段。
- 私有预览只输出 allowlist 字段，不包含原始 payload 或私有字段。
- 私有预览写入忽略目录 `var/`，不修改 `dist/`、`data/snapshot/v1.json` 或公开内容指纹。
- 当前已知 Scout 测试失败已用独立 fixture 修复，完整 Scout 测试通过。
- `npm run check` 与 `npm run build` 通过后，首个实施包才可完成。

## 6. 后续边界

本包通过后，下一规格才可以处理来源目录替换、具身历史基线、完整领域对象、同行能力矩阵、公开页面切换和通用 AI 当前数据清理。
