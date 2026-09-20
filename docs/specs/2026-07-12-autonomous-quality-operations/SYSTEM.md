# 系统设计

## 1. 自主运营流程

```text
source audit
  -> adapter recovery / feed fallback
  -> latest health persisted
  -> lifecycle reconcile
       healthy shadow -> observation
       repeated active failure -> degraded
       repeated degraded failure -> quarantined
  -> collect eligible sources
  -> discovery triage
       known identity -> matched
       existing signal -> merged
       strong unknown -> disabled draft proposal
  -> cluster / readiness preparation
  -> scout inbox generation
  -> evaluate / monitor / export
```

所有步骤幂等，单来源失败不终止整批任务。公开发布不在该自动链路内。

## 2. 来源抓取与生命周期

`web-scraper` 在 HTML 提取结果全部缺少可信日期时仍尝试页面声明的 RSS/Atom，并优先保留 feed 结果。带日期文章链接的识别不依赖 `href` 与 `class` 的属性顺序，并兼容常见英文月份缩写。adapter 只输出同时具备非空标题、同站公开 URL 与可信发布日期的对象；采集时间推断值不得离开 adapter 进入规范化结果。来源生命周期统一使用既有失败计数和 transition contract，不直接绕过规则写状态。

晋级使用统一资格：最近检查健康、至少 20 次健康检查且观察窗口达到 7 天。旧的“一次健康即激活”和“3 次/1 天”路径移除。

## 3. 来源雷达

雷达自动推进分三层：

1. 精确 URL / root domain / 已有 source identity 自动标记 matched；
2. 已被 signal 消费的发现自动标记 merged_signal；
3. 通过安全 URL、独立证据数和来源角色门槛的未知域生成 disabled draft proposal。

低置信度、共享平台、聚合站自身 URL 和许可不明候选保留待审，不自动进入 shadow/active。

## 4. 星探动态生成

候选池先按价值排序，再逐项检查 `kind:event` 冷却键，直到产生本轮上限或耗尽候选池。kind 根据历史计数轮转，避免每轮固定前三个事件。新建议只进入 inbox；过期建议在前台不再作为新鲜信号展示。

## 5. 后台操作契约

来源列表返回 operation readiness：

- action 是否允许；
- 禁用原因；
- 最近检查状态、健康检查数和观察天数；
- 推荐下一步。

前端为每个来源维护 busy 状态，成功后刷新来源、检查记录和统计；409/422 展示服务端具体原因，不再只显示“操作失败”。

## 6. 评测与 Actions

评分函数继续只消费真实证据。Actions 输出机器可读评测、来源健康报告和质量摘要，并保留 80 分目标。证据不足时 workflow 预警而非篡改评分；达到稳定样本后再把目标升级为硬门禁。

Actions 分工：

- CI：代码、测试、静态安全和 workflow 校验；
- Source audit：审计、生命周期协调、观察模式、评测基线同步和健康 issue；
- Data refresh：采集、聚类、雷达推进、星探生成、评测、导出和快照；
- Monitor：只读健康检查与告警，不修改业务数据。

## 7. 版本化评测与 CI 提升闭环

```text
repository snapshot
  -> restore evaluation history + current evidence
  -> run deterministic evaluation
  -> compare with previous main report
       regression -> fail CI with exact dimension
       stable/growth -> export ranked evidence gaps
  -> Data Refresh gathers real evidence
  -> persist latest report + append evaluation run to snapshot
  -> next CI uses the new score as its baseline
```

- `evaluation_runs` 使用运行 ID 作为稳定键进入 `data/snapshot/v1.json`，恢复时 append/upsert，旧快照缺字段仍兼容；
- `data/reports/system-evaluation.json` 保存最新总分、原始加权分、证据覆盖、完整维度和按加权缺口排序的改进动作；
- Source Audit 修改来源生命周期后必须重新生成评测报告，并与来源健康报告和 snapshot 在同一提交中写入，禁止产生新来源状态与旧评测基线的组合；
- CI 基线来自上一提交，而不是 PR 自己修改后的报告，防止通过下调版本化分数绕过回退门禁；
- 回退门禁覆盖 overall score、evidence coverage 和各维度 score；维度新增允许进入基线，维度删除视为回退；
- 来源覆盖的基础样本使用 healthy 且处于 observation 或 active 的去重集合，active 仅作为额外成熟度证据；来源从 observation 晋级 active 不得导致分数下降；
- Quality Guard 分页读取 Data Refresh 运行态时先保存 `gh api --paginate --slurp` 的页面数组，再由独立 `jq` 归一化，避免依赖互斥的 CLI 输出参数组合；
- 低于 80 分不是伪造数据或放宽门槛的理由。CI/Quality Guard 只暴露下一步，Data Refresh 只能通过真实审计、采集、证据绑定和用户结果样本改善分数；
- 静态导出优先读取最近一次评测，不再因为每次页面构建重复制造等价评测记录。
