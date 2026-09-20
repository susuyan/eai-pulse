# 测试方案：评测时间语义与双门禁

## 1. 单元测试

### 1.1 固定时钟

- 相同数据库、相同 `evaluationAsOf` 在不同墙钟时间运行，overall、raw weighted、evidence coverage 和 dimensions 完全相同。
- `startedAt` / `finishedAt` 可以变化，但不得影响评分或 comparison。
- 评分路径中不存在未注入的 `Date.now()` 或 `new Date()`。

### 1.2 时间切片

- `finished_at > evaluationAsOf` 的 SourceRun/SourceCheck 不参与 latest row 选择。
- `created_at > evaluationAsOf` 的 Event/Signal/Scout/关系证据不参与评测。
- `last_success_at > evaluationAsOf` 不计入 7 天成功窗口。
- 恰好位于参考时刻的证据参与计算。
- 非法、缺失或未来时间不能通过负 age 抬分。
- 超过 2,000 条未来 SourceRun 和 5,000 条未来 SourceCheck 不影响相同参考时刻的历史评测。

### 1.3 报告 schema

- v2 必须包含合法 `evaluationAsOf` 和 `gateMode`。
- 合法 v1 使用 `finishedAt` 规范化为 operational baseline。
- v1 缺失 `finishedAt`、非法 JSON、未知 schemaVersion 和字段类型错误均 fail closed。
- 规范化只发生在内存，输入文件内容不改变。
- 严格拒绝无效日历日期、数字、非 ISO 文本、无时区时间；合法闰日与显式偏移通过。
- 通用解析器接受 v2 change 报告；CLI baseline 和 Monitor 水位拒绝该模式，并输出不可刷新的非法报告状态。

### 1.4 Change gate

- 同一参考时刻、同一证据通过。
- overall、raw weighted、evidence coverage 或任一既有维度降低时失败。
- 维度删除失败，新增维度允许进入 baseline 演进。
- current 与 baseline 的参考时刻不一致时返回 `evaluation_context_mismatch`。
- realtime/timeliness 在固定时钟下真实回退时仍失败。

### 1.5 Operational gate

- score 60 通过，59 返回 `system_score_below_floor`。
- persisted `evaluationAsOf` 未满 24 小时不产生 staleness reason。
- 满 24 小时返回 `evaluation_stale`。
- 满 72 小时返回 `evaluation_persistently_stale`。
- reason code 顺序不影响 fingerprint。
- 非法 persisted report 返回 `evaluation_report_invalid`，且不自动覆盖 baseline。

## 2. 集成测试

### 2.1 CLI

- 当前仓库数据与现有 v1 baseline 使用 change gate 时通过。
- `change` 缺少 baseline 失败。
- `change` 与冲突的显式 `--as-of` 同时出现时失败。
- `operational` 输出结构化 policy decision，并将 report 和 summary 写到指定位置。
- `persist=false` 不增加 `evaluation_runs`；`persist=true` 恰好增加一条。
- change gate 不得将 output 写回 baseline 同一路径；operational gate 的无效、缺失或未来 baseline 在写库前失败。
- 旧 `--fail-on-regression` 映射到 change gate，并输出迁移提示。

### 2.2 Data Refresh

- 只在采集、remote merge、reconciliation 和评测全部成功后写 v2 report 与 snapshot。
- v2 report 与 snapshot 中的 evaluation run 使用同一个 ID、score 和 `evaluationAsOf`。
- JSON 校验、隐私扫描或 snapshot 写入失败时，不产生部分提交。
- incremental refresh 不隐式启用 weekly publish。

### 2.3 Monitor

- snapshot 文件 mtime 为当前时间、版本化 `evaluationAsOf` 超过 72 小时时仍判定持续过期。
- 文件 mtime 很旧、版本化 `evaluationAsOf` 新鲜时不因 mtime 失败。
- v1 baseline 使用 `finishedAt` 得到相同 age 结论。
- site、source health 和 evaluation staleness 进入同一 incident contract，但保留独立 reason code。
- Monitor 识别 Quality Guard 同一评测原因集合的指纹并进入冷却；持续过期仍触发硬告警。

## 3. Workflow 契约测试

- CI 明确使用 change gate 和上一提交 baseline。
- CI 在评测后上传临时 artifact，不修改版本化 report。
- Quality Guard 使用 operational gate 和绝对政策。
- 失败路径的文本顺序满足：artifact/summary → Issue → cooldown → incremental refresh → fail。
- 最近 refresh 为任意非 completed 状态时不 dispatch，包含 pending/waiting/requested 与未知状态。
- cooldown 未到时不 dispatch。
- 最近 refresh 失败且没有运行中任务时允许一次重试。
- dispatch 不包含 `publish_weekly=true`。
- 两个 Issue 写入者共享非取消串行边界，按稳定 marker 和标签查找同一 Issue。
- 恢复刷新显式传入 `recovery=true`；周日夜间也不生成或发布周报。
- 所有已暂停 schedule 仍保持注释。

## 4. 回归场景

### 4.1 纯墙钟漂移

给定 2026-08-26 baseline 和未变化的 snapshot，在 2026-09-20 或更晚执行 change gate，预期通过。

### 4.2 真实时间能力回退

在固定参考时刻删除一批成功 SourceRun 或最近 Event，预期 realtime/timeliness 降低并精确失败。

### 4.3 真实运营过期

保留旧版本化报告，以当前时间执行 operational gate，预期低于 60 或超过 age policy，记录告警并进入有界刷新决策。

### 4.4 评测公式回退

在 fixture 中修改候选算法使时间维度降低，baseline 和 candidate 使用同一参考时刻，预期 change gate 失败。

## 5. 完成门禁

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run db:seed`
- change gate 对现有 v1 baseline 通过
- operational gate 对旧数据输出预期失败原因
- `npm run export -- --skip-seed`
- `npm run public:validate`
- `npm run build`
- 关键 workflow 契约测试通过
- 无版本化 snapshot、旧评测报告或 schedule 的非授权变化
