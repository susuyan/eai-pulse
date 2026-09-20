# SYSTEM：具身数据认知系统领域基础

## 1. 设计原则

- `Event` 继续作为唯一事实节点。
- `content_scope` 表示内容归属，不表示事实可信度或发布状态。
- DataProfile 只保存结构化维度和影响，不复制 Evidence 正文。
- 所有写入和读取都通过同一严格 Zod Schema。
- 迁移为纯增量；当前行默认 `legacy-ai`。
- 相关性评估只生成迁移建议，不修改数据库或公开站。

## 2. 数据模型

以下现有表新增 `content_scope varchar(40) not null default 'legacy-ai'`：

- `sources`
- `signals`
- `events`
- `actors`

新增 `event_data_profiles`：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `event_id` | varchar(36) | 主键，关联 `events.id`，级联删除 |
| `profile_json` | text | 严格 Schema 校验后的 JSON |
| `schema_version` | integer | 当前为 1 |
| `created_at` | varchar(40) | UTC ISO-8601 |
| `updated_at` | varchar(40) | UTC ISO-8601 |

稳定枚举留在 `src/domain/embodied-data.ts`。快速演进的领域组合保存在 DataProfile JSON 中，避免把大量未稳定字段直接加入 `events`。

## 3. DataProfile 边界

DataProfile 包含：

- 六个具身数据管线阶段；
- 场景、本体、任务、模态和采集方式；
- 数据格式和相关标准；
- 带原始 URL 的结构化规模声明；
- 质量指标、成本信号和交付影响；
- `claimed`、`verified` 或 `conflicting` 证据状态。

DataProfile 不包含：

- 原始 collector payload；
- 未裁剪的第三方正文；
- 客户私有数据或内部项目名称；
- 无来源的规模、成本或质量数字；
- 发布状态、热度或事实置信度的替代字段。

## 4. 私有预览数据流

```text
repository snapshot
        |
        v
published + review Events
        |
        v
deterministic relevance assessor
        |
        +-> include / review / reject
        +-> matched pipeline stages
        +-> stable reason codes
        |
        v
var/embodied-data-preview.json
```

预览只允许输出 Event ID、slug、标题、状态、当前 scope、建议结论、管线阶段、原因码和是否已有 DataProfile。

## 5. 相关性评估

确定性评估要求同时存在：

1. 具身锚点，例如机器人、本体、操作、导航、遥操作或 VLA；
2. 数据生产锚点，例如采集、数据集、模态、标注、Schema、同步、质量、成本或训练反馈。

同时具备两类锚点且至少命中两个独立数据生产信号时建议 `include`；两类锚点存在但数据影响过薄时建议 `review`；缺少任一类锚点时建议 `reject`。

该评估不读取来源权威度、Evidence 数量或发布状态，不能代替 readiness。

## 6. 快照兼容

`data/snapshot/v1.json` 使用向后兼容的可选字段扩展：

- Source、Signal 和 Event 增加可选 `contentScope`。
- 增加可选 `eventDataProfiles` 数组。
- 缺少新字段的旧快照按 `legacy-ai` 恢复。
- 新快照中的每个 DataProfile 在恢复前必须通过 Schema。
- 快照读取使用一致性事务；DataProfile 的 Event 引用、schema version 和 ISO 时间戳必须完整有效，恢复既有 Profile 时保留 `created_at`。

本包不重写版本化快照。快照文件只在后续人工确认的内容迁移阶段生成。

## 7. 失败与回滚

- Schema 校验失败：拒绝写入或恢复，不保存部分 Profile。
- Event 不存在：Repository 写入失败。
- 预览写入失败：公开导出和数据库不受影响。
- 回滚顺序：停止预览 CLI，删除 `event_data_profiles`，再按反向顺序删除 scope 列。
- 已生成的 `var/embodied-data-preview.json` 可直接删除，因为它不是事实存储或发布输入。

## 8. 安全与隐私

- 预览不读取或输出 `raw_meta_json`。
- 规模声明必须使用不含 userinfo、查询参数与 fragment 的公开 HTTPS URL。
- 输出路径位于 `.gitignore` 已覆盖的 `var/`。
- 不修改公开 DTO、Pages、sitemap、`llms.txt` 或 Changelog 页面以外的公开内容。
