# 重点来源审计报告与持久化边界

日期：2026-09-21。范围：Plan 3 Task 5 分阶段实施；真实三轮窗口尚未完成，远端工作流和发布未执行。

- 审计队列始终包含 manifest 的 12 个来源；并发上限为 4。政策 pending/restricted 的来源必须在网络请求前记录 policy_skipped；一次作业最多为每源记录一次检查。检查通过不能替代政策审核。
- 版本化 cohort 报告使用严格 allowlist，只保留公开 slug、状态、数量、时间、适配器版本、已哈希的契约身份、审核政策、实际生命周期和观测窗口摘要。不输出原始内容、样本、内部 ID、错误原文、配置或私有备注。
- 完整审计作业的完成时间代表审计流程的新鲜度，不代表全部来源健康。报告缺失、损坏、来源集合不全、未来时间或超过声明的 24 小时窗口必须失败；单个 draft/shadow 失败只影响该来源的观测资格。
- `window.completedSpacedRuns` 只统计完整 cohort 审计轮次（包括如实记录的政策跳过），不等于任何来源通过健康窗口。报告中的 eligible 还要求完整三轮窗口、当前允许政策、健康且非空的契约检查及三次合格证据；摘要必须与逐源数据自洽。
- `newlyShadow` 只统计最近一次完整 cohort 审计完成后、本报告生成前实际执行的 draft→shadow 转换。逐源 `shadowTransition` 保存严格校验的转换时间和三次合格检查计数，汇总必须等于有效标记数。原有 shadow、只有生命周期变化而无成功 verify 作业、窗口外转换均不算新增。旧报告省略该字段等同 null；以后恢复后开启的新报告周期可以如实为 0，不向 snapshot 增加观察控制作业。
- 转换作业中的检查 ID 集合必须精确等于当前 `observationEligibility` 返回的完整有效三次窗口；直接复用该门禁校验政策、schema、重复率、质量和当前契约，不在报告中实现宽松副本。当前窗口失效时撤回新增转换标记。独立报告校验即使看到 eligible=false，也必须拒绝不满足 allowed/healthy/非空/三次检查/完整窗口的转换标记。
- 生产健康计算排除 draft/shadow 的健康分。试验来源失败不能通过自动 quarantine 被误算为生产事故；既有 active/degraded 隔离与事故处理保持原门禁。
- 本地第一轮使用专属证据数据库，真实 UTC 时间及真实失败原样保留。后续轮次必须在前轮完成后至少六小时执行；最终 Changelog 在真实计数确定后统一更新。
- 所有远端写入、工作流触发、Issue 修改、Pages 发布和恢复已暂停的定时器均不在本阶段执行。

## 经确认的跨运行证据

- snapshot 新增可选 `priorityAuditEvidence`。只导出与重点来源相关且拥有明确目标集合的审计作业；使用公开来源 slug、门禁需要的状态/计数/时间、契约 hash 和内容 hash。没有内部来源/作业/检查 ID、错误原文、样本或配置。
- 作业身份由原始开始时间和规范排序后的明确目标集合取 hash，内容 hash 绑定整个严格校验的记录。输入目标和检查必须已经采用导出器的规范排序；反转数组后重算 hash 也拒绝。恢复时重新映射本地来源 ID，并使用确定性本地 job/check ID；重复恢复幂等，身份相同而内容不同拒绝。
- 完整、失败、未完成和 running 作业均保留。未知/重复目标或检查、非法时间、计数矛盾、未知字段、坏 hash 或冲突数据使恢复事务失败。旧快照没有该字段时不创建任何审计作业。
- 终态计数采用 producer 的同一不变量：零错误为 succeeded；有错误且存在 healthy 结果为 partial；有错误且 healthy 为零为 failed（skipped 不能冒充 healthy）。终态计数必须与检查逐项吻合；未完成尝试须带 incomplete 标记，错误数额外包含一次 AUDIT_INCOMPLETE。真实 partial+incomplete 尝试可以保留，但绝不构成有效窗口；running 作业的结算计数保持零。
- 历史无契约指纹且 LEFT JOIN 找不到真实作业的检查明确为 legacy non-evidence（即使保留旧 job_id），不贡献次数，也不永久阻断新窗口。具有当前契约指纹但缺失有效作业关联的检查继续 fail closed。真实新失败与未完成目标作业仍截断窗口。
- 对应检查只写入新证据字段，避免旧 `sourceChecks` 路径另存一次并丢失作业关联。其他已有 snapshot 数据不改语义。
- GitHub cron 保持注释暂停；只完善 workflow_dispatch 执行链。真实后续审计使用同一本地证据数据库，并遵守六小时间隔。

## NIST 政策证据（2026-09-21）

- 官方 [Copyrights and Disclaimers](https://www.nist.gov/copyrights-disclaimers) 将网页作为公共服务提供，允许复制和分发未标记版权的信息；这不是第三方内容的概括授权。
- [指定项目页](https://www.nist.gov/programs-projects/physical-ai-and-data-generation-robotics) 可见标题、canonical URL 与 Created December 11, 2018；审核页面未对这些字段标记版权。[robots.txt](https://www.nist.gov/robots.txt) 未禁止该项目路径。
- 此决定只允许上述三个元数据字段，不允许联系人、图片、出版物或第三方材料。直接返回 HTTP 200 不构成授权。审核依据记录在 `priority-source-policy.ts`；parser fixture 与 `tests/pipeline/configured-html-collection.test.ts` 的真实 parser 路径验证独立于政策授权，不能据 fixture 扩大政策范围。
