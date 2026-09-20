# PRD：评测时间语义与双门禁

## 1. 现状与问题

当前 `realtime` 和 `timeliness` 维度直接读取墙钟时间。CI 恢复版本化快照后，用运行当天的分数与上一提交中较早生成的报告比较。即使代码和数据完全不变，来源成功时间和事件发生时间也会因为时间窗口自然滑出而降分。

2026-09-20 的实际 CI 证据为：

- 版本化基线生成于 2026-08-26，总分 62；
- 同一份仓库数据在 2026-09-20 重算后总分 56；
- `realtime` 从 85 降至 51；
- `timeliness` 从 61 降至 26；
- lint、typecheck、374 项测试和数据库恢复均通过。

这个结果同时暴露两个不能混为一谈的问题：

1. PR 门禁把墙钟漂移误判为变更回归；
2. 版本化数据确实长期未刷新，运营系统应当告警并尝试恢复。

此外，Monitor 当前使用 `data/snapshot/v1.json` 的文件 mtime 判断新鲜度。Git checkout 会重置工作区 mtime，因此该信号不能证明版本化数据何时完成评测或刷新。

## 2. 产品目标

1. PR CI 只阻止由候选代码或候选版本化数据造成的回退，不因运行日期不同而误报。
2. `realtime` 和 `timeliness` 继续参加 PR 的逐维回归比较，不能通过忽略维度或放宽阈值制造通过。
3. 运营门禁按当前时间识别真实过期、低质量和停更，并保留可审计证据。
4. 运营门禁失败后更新单一健康事件，并在冷却期允许时最多触发一次有界 incremental refresh。
5. schema v1 报告可被安全读取；迁移不要求立即刷新旧快照或改写旧评测报告。
6. clone、CI 和本地环境对同一版本化报告得出一致的新鲜度结论。

## 3. 非目标

- 不修改评分权重、样本门槛、证据覆盖算法或 80 分目标。
- 不自动刷新 `data/snapshot/v1.json` 或 `data/reports/system-evaluation.json` 来消除现有失败。
- 不在本规格中恢复任何已注释的 schedule。
- 不触发 Pages 发布，不改变公开 DTO。
- 不把运营数据过期解释为代码质量通过；两类门禁分别给出结论。
- 不引入逐维固定运营阈值；稳定运行样本不足时复用现有绝对政策。

## 4. 用户与决策

### 开发者与评审者

需要知道一个 PR 是否使系统能力或证据回退。其结论必须排除自然时间流逝，并精确指出失败维度。

### 运营负责人

需要知道数据是否已经过期、是否应执行一次恢复，以及恢复是否被冷却期或运行中任务阻止。

### 审计者

需要从版本化报告中还原评测参考时刻、门禁模式、比较结果和采取的恢复动作。

## 5. 功能要求

### 5.1 变更回归门禁

- 必须读取上一提交的版本化 baseline。
- 候选评测必须使用 baseline 的参考时刻。
- schema v2 baseline 使用 `evaluationAsOf`；schema v1 baseline 使用 `finishedAt` 作为兼容参考时刻。
- overall score、raw weighted score、evidence coverage 和所有既有维度继续比较。
- baseline 缺失、结构非法、时间戳非法或参考时刻不一致时 fail closed。
- CI 只写临时 report 与 artifact，不持久化新的版本化 baseline。

### 5.2 运营时效门禁

- 必须以本次运行时间作为 `evaluationAsOf`。
- 系统分低于 60 时失败。
- 最近一次版本化运营评测超过 24 小时时进入 critical；超过 72 小时时进入持续性硬告警。
- 失败必须产生结构化 reason code、Actions Summary 和 artifact。
- 更新单一健康 Issue 后，按 120 小时 cooldown 决定是否派发一次 incremental data-refresh。
- 已有 refresh 正在运行时不得重复派发。
- 任何失败不得推进 collector cursor、覆盖版本化 baseline 或触发 weekly publish。

### 5.3 Monitor 新鲜度

- Monitor 使用版本化运营报告的 `evaluationAsOf` 作为权威水位。
- 文件 mtime 可作为诊断字段展示，但不得参与 pass/fail。
- Quality Guard 与 Monitor 共享 reason code、fingerprint 和单一健康 Issue，避免重复告警。

## 6. 验收标准

1. 当前 main 与现有 schema v1 baseline 在 change gate 下通过，不修改版本化数据。
2. 同一数据库和同一参考时刻在不同真实时间运行，评测分数完全一致。
3. 固定参考时刻后，真实删除证据或改坏时间窗口公式仍使对应维度回退并失败。
4. 当前旧数据在 operational gate 下仍被识别为低于绝对政策或过期。
5. checkout 后文件 mtime 很新但版本化 `evaluationAsOf` 过期时，Monitor 仍判定过期。
6. 告警、refresh 决策和最终失败的顺序可由 workflow 契约测试证明。
7. `npm run check`、`npm run build`、workflow 契约与静态隐私校验通过。
