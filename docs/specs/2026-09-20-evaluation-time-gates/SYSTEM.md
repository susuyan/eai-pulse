# 系统设计：评测时间语义与双门禁

## 1. 设计原则

- **同一问题只使用一个时钟**：评分函数不得隐式读取墙钟。
- **回归与过期分开判断**：PR 回答“候选变更是否更差”，运营门禁回答“系统现在是否健康”。
- **所有维度保持诚实**：时间维度不从 CI 排除，运营阈值也不随 baseline 年龄自动变软。
- **版本化报告是审计事实**：执行时间、评测参考时刻和门禁模式必须分别记录。
- **异常时停止推断**：schema 或时间上下文不可信时 fail closed，不猜测或自动重写 baseline。

## 2. 显式评测上下文

评测入口接收显式上下文：

```ts
type EvaluationGateMode = "change" | "operational";

interface EvaluationContext {
  asOf: Date;
  gateMode: EvaluationGateMode;
  persist: boolean;
}
```

`evaluateSystem`、时间窗口函数和报告构建器都只能从 `context.asOf` 读取当前时刻。测试通过固定 `Date` 注入确定性时间，不需要修改进程全局时钟。

### 2.1 时间切片规则

时间证据必须满足 `timestamp <= evaluationAsOf`：

- SourceRun 使用 `finished_at`，未完成行不作为成功证据；
- SourceCheck 使用 `finished_at`；
- Event 使用 `created_at` 作为是否已存在的边界，窗口使用 `happened_at`；
- Signal 使用 `created_at`，窗口使用 `published_at`；
- Scout 使用 `generated_at`；
- 关系证据使用各自 `created_at`；
- `last_success_at` 晚于参考时刻时不计入 7 天成功窗口。

SourceRun 和 SourceCheck 的数据库时间条件必须先于排序数量上限执行，避免未来记录挤出历史证据。评测上下文与报告时间戳统一使用严格 ISO-8601 校验，必须包含 `Z` 或显式时区偏移，并拒绝不存在的日历日期、数字字符串与无时区时间。

版本化 source 当前状态不是事件溯源模型。其 lifecycle、enabled 和其他当前态字段仍代表候选快照的显式状态变化；时间证据则按上述规则切片。若将来需要完整历史重放，应单独引入 source state transition history，不在本规格内伪造。

## 3. 报告 schema v2

```ts
interface SystemEvaluationReportV2 extends EvaluationResult {
  schemaVersion: 2;
  evaluationAsOf: string;
  gateMode: "change" | "operational";
  target: number;
  targetReached: boolean;
  policy: "measured-evidence-only";
  improvementPlan: EvaluationImprovement[];
}
```

- `evaluationAsOf`：评分窗口使用的唯一参考时刻。
- `gateMode`：生成报告时使用的门禁语义。
- `startedAt` / `finishedAt`：本次程序执行的实际时间，只用于耗时和审计。
- 版本化 baseline 必须来自 `gateMode=operational` 的成功 Data Refresh。
- change gate 输出只进入临时 artifact，不得覆盖版本化 baseline。
- 通用报告读取器保留两种模式；CLI baseline 与 Monitor 水位读取器必须额外要求 `gateMode=operational`。错误模式按非法报告处理，不授予刷新权限。

### 3.1 v1 兼容适配

读取器先以明确 schema 校验报告。对合法 v1：

```text
evaluationAsOf = finishedAt
gateMode = operational
```

适配只存在于内存，不回写旧文件。`finishedAt` 缺失或不是合法 ISO timestamp 时拒绝比较。

## 4. Change gate 数据流

```text
HEAD^ system-evaluation.json
  -> validate and normalize baseline
  -> referenceAsOf = baseline.evaluationAsOf
  -> restore candidate repository snapshot
  -> evaluate candidate with referenceAsOf and persist=false
  -> assert identical referenceAsOf
  -> compare overall/raw/evidence/all dimensions
  -> write summary + artifact
  -> pass or fail CI
```

比较函数除既有分数字段外，增加上下文前置条件。上下文不一致不是普通 regression，而是 `evaluation_context_mismatch`，CI 直接失败。

候选快照包含参考时刻之后的新证据时，这些证据不参与 change gate。Data Refresh 以当前时刻生成新的 operational baseline 后，后续 PR 才以新水位比较。这样不会用“未来数据”抬高旧 baseline 下的候选分数。

## 5. Operational gate 数据流

```text
versioned operational report
  -> validate persisted evaluationAsOf
repository snapshot
  -> evaluate at runStartedAt with persist=false
  -> apply absolute policy
       score < 60
       persisted age > 24h -> critical
       persisted age > 72h -> persistent hard alert
  -> write artifact and summary
  -> upsert one health incident
  -> inspect data-refresh run and 120h cooldown
  -> dispatch at most one incremental refresh
  -> fail guard when policy is breached
```

Operational gate 不用旧分数做相对比较。其目标是恢复当前运营状态，而不是证明某次代码变更造成下降。

### 5.1 领域切换后的双状态

领域切换后，长期运营成熟度与公开内容发布资格必须分开表达：

- `operationalDecision` 继续按绝对分数和水位年龄判断长期运营成熟度。低于 60 分仍是 `critical`，必须保留 Incident、刷新建议和完整证据，禁止降低分数或关闭告警来换取绿色状态。
- `publicReadinessDecision` 只回答当前具身公开站是否可以继续发布。它要求具身质量五项门禁全部通过、通用 AI 泄漏为零，且版本化评测水位合法且未过期。
- `system_score_below_floor` 不单独阻断已经通过具身质量门禁的静态公开站；其他运营原因（无效报告、24 小时或 72 小时过期）仍然阻断公开发布。
- Quality Guard 始终记录两个状态。运营成熟度为 `critical` 时继续更新同一个 Incident 和执行有界刷新；只有 `publicReadinessDecision` 为 `critical` 时才使公开发布门禁失败。

该分离不声明 collector 已达到生产级，也不把 `shadow` 来源视为 `active`。它只避免使用旧通用 AI 领域的绝对成熟度分数，否决已经通过独立领域硬门禁的具身静态内容。

若公开切换后的首次 Data Refresh 因工作流契约错误未能写入新领域 baseline，可使用一次独立的运营 baseline 收口 manifest。该 manifest 必须同时绑定目标 base Git SHA、base snapshot SHA-256 和旧 evaluation report SHA-256，并继续要求当前时刻具身质量门禁全部通过、零通用 AI 泄漏。目标 base 或旧报告任一变化后授权自动失效。

### 5.2 结构化策略结果

```ts
interface OperationalEvaluationDecision {
  status: "ok" | "critical";
  reasonCodes: Array<
    | "system_score_below_floor"
    | "evaluation_stale"
    | "evaluation_persistently_stale"
    | "evaluation_report_invalid"
  >;
  currentScore: number | null;
  persistedEvaluationAsOf: string | null;
  ageMinutes: number | null;
  refreshEligible: boolean;
  fingerprint: string;
}

interface PublicReadinessDecision {
  status: "ok" | "critical";
  reasonCodes: Array<
    | "evaluation_stale"
    | "evaluation_persistently_stale"
    | "evaluation_report_invalid"
    | "missing_stage_coverage"
    | "insufficient_tier1_evidence"
    | "incomplete_data_profile"
    | "unsupported_peer_claim"
    | "generic_ai_leak"
  >;
  fingerprint: string;
}
```

fingerprint 只依赖排序后的 reason code 和政策版本，不包含波动时间。相同事故更新同一个 Issue，不重复创建。

## 6. Quality Guard 与 Monitor 分工

- Quality Guard 是评测运营政策的执行者：生成当前评测、判断绝对门槛、记录事件、决定有界刷新并返回失败状态。
- Monitor 是统一可用性视图：站点、来源健康和版本化评测水位。它读取同一个策略结果与 incident fingerprint，不再自行使用文件 mtime 推导新鲜度。
- 两者更新同一个健康 Issue marker；不同 reason code 可以改变 fingerprint 并更新问题内容。
- Quality Guard 只派发 `mode=incremental`，不设置 `publish_weekly=true`。
- Monitor 的评测原因集合使用同一政策指纹；站点、来源或脚本故障保留独立信号。站点故障、脚本故障和 72 小时持续过期仍优先执行硬告警。
- 两个健康事件写入工作流共享非取消并发组，使用 `monitor:critical` 标签和稳定 marker 选择同一个开放 Issue。
- 恢复派发显式设置 `recovery=true`；Data Refresh 在恢复模式下禁止周报分支，包括周日自动分支和显式周报输入。

## 7. CLI 与兼容期

新 CLI 使用显式 gate：

```text
npm run evaluate:system -- --gate=change --baseline=<path> --fail-on-regression
npm run evaluate:system -- --gate=operational --baseline=<path>
```

- `change` 必须提供 baseline，并自动继承参考时刻；调用方不能另传冲突的 `--as-of`。
- `operational` 默认使用进程启动时捕获的一次 UTC 时间；测试可显式注入 `--as-of`。
- 现有 `--fail-on-regression` 在一个版本周期内映射到 `--gate=change`，并在 summary 中给出迁移提示。
- 删除兼容 flag 需要独立 Changelog 和 release 决策。

## 8. 持久化与原子性

- `persist=false` 时不得写 `evaluation_runs`。
- Data Refresh 在采集、远端 snapshot merge 和 reconciliation 完成后，使用 `persist=true` 生成 operational report。
- Source Audit 在远端 snapshot merge 和 lifecycle reconciliation 完成后，同样使用 `persist=true` 刷新 operational report；来源健康报告、评测报告和 snapshot 必须原子提交。
- evaluation run 必须持久化 `evaluationAsOf` 和 `gateMode`；旧行只能显式回退到 `finishedAt` + `operational`。
- evaluation run、`data/reports/system-evaluation.json` 和 `data/snapshot/v1.json` 必须在同一版本化提交中出现。
- 无效、缺失或未来时间的 operational baseline 不得写入历史，也不得原地覆盖；独立诊断 artifact 仍可读取失败状态。
- Data Refresh 在报告写入、JSON 校验、隐私扫描或 snapshot 生成失败时不得提交部分状态。
- PR CI 和 Quality Guard 使用临时数据库与临时 report，不推进版本化 baseline。

## 9. 告警与有界刷新

执行顺序固定：

1. 写机器可读 report 与 policy decision；
2. 上传 artifact 并写 Actions Summary；
3. upsert 单一健康 Issue；
4. 检查最近一次 Data Refresh 状态与 120 小时 cooldown；
5. 若不存在运行中 refresh 且允许重试，派发一次 incremental refresh；
6. 最后使本次 guard 失败。

Issue 仅包含公开安全 DTO：分数、age、reason code、建议动作和 Actions URL。数据库内容、raw payload、token、本机路径和模型输入不得进入 Issue。

刷新去重读取 main 分支全部 Data Refresh 运行状态，所有非 `completed` 状态均视为活动任务，包括 `pending`、`waiting`、`requested` 与未知的新状态。最近完成失败仍允许重试；成功运行仍执行 120 小时冷却。

## 10. 迁移顺序

1. 先增加 v1/v2 parser、显式 EvaluationContext 与固定时钟测试。
2. 修改 change gate，但继续读取现有 v1 baseline；证明当前 main 不再因墙钟漂移失败。
3. 修改 operational policy、Quality Guard 和共享 incident contract。
4. 将 Monitor 从 mtime 迁移到版本化 `evaluationAsOf`。
5. 修改 Data Refresh，在下一次真实成功刷新时自然写出 v2 baseline。
6. 一个版本周期后，根据仓库中是否仍存在 v1 baseline 决定是否移除旧 CLI flag；v1 reader 保留到明确迁移决策。

迁移期间不手工刷新旧 baseline，不修改历史报告，不恢复 schedule。

## 11. 回滚

- workflow 调用可先退回旧 CLI flag；v2 reader 继续兼容 v1，不影响旧报告读取。
- 若 operational orchestration 需要回滚，停止 refresh dispatch，保留 artifact 与 Issue 告警；不得通过忽略过期状态恢复“绿色”。
- 若 v2 写入失败，Data Refresh 整体失败并保留上一份 v1/v2 baseline。
- rollback 不删除 evaluation history，也不改写已发布报告。
