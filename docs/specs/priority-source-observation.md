# 重点来源 shadow 观测门禁

日期：2026-09-21。范围：Plan 3 Task 4；不执行真实观测，不批准任何来源政策，不晋级 active。

- draft 仅在当前 embodied catalog 与 12 源 priority manifest 中存在且未 restricted/retired 时可申请 verify。运行时 adapter、adapter_version、端点及提取配置必须匹配 catalog 与独立的已通过 fixture 契约记录。版本变化必须重新验证，旧版本 SourceCheck 不可复用。
- fixture 契约记录与政策审核分开：政策必须明确 allowed_metadata，具有审核人、时间和理由。当前 12 源全部 pending；HTTP 成功及 audit 自动写出的 allowed_metadata 不能代替政策审核。priority shadow 也执行同一政策与证据门禁。
- 连续健康区间内至少三个独立审计 job 的 SourceCheck，相邻选中检查开始时间距较新检查开始时间至少六小时，且较早检查结束距较新检查开始至少六小时；失败、降级、未知版本或不合格检查截断区间。选取最新检查后向前贪心选择满足间隔的检查。
- 最新检查结束距当前时间不超过 24 小时；未来时间、非法时间、结束早于开始均拒绝。每条检查必须 HTTP 2xx、reachable、fetch/parse succeeded、schema valid、item_count > 0、quality_score >= 60、duplicate_ratio_bps < 8000、policy allowed_metadata、无错误字段。304 不计新成功。保留内容年龄不超过 90 天的既有门禁。
- SourceCheck 必须属于已结束的 source-audit job。fixture 仅在 tests 中构造，不产生 versioned health report 或真实观测证据。
- 经用户批准新增 nullable 私有 source_checks.contract_fingerprint（迁移支持 down）。指纹使用稳定键排序与 SHA-256，绑定规范化端点、adapter/version、acquisition、语言、备用 homepage 及经 schema 解析的完整有效配置（包括 take、category、mode、detailTake、dataPath 和全部 HTML 规则）。fixture 记录独立固定预期指纹；运行时、catalog 与每条检查必须匹配。旧/null 指纹不补造，必须重新审计。只保存 hash，不保存配置或认证信息；仓库 snapshot 保留 hash，公开 DTO 不包含此字段。
- 审计完成时原子记录 auditComplete 与 expectedSourceCount。检查要求完整 source-audit job、真实持久化检查数与声明数量一致；partial 仅允许其他来源失败，不能包含 AUDIT_INCOMPLETE、未完成标记或缺失检查。
- 窗口选择前先解析所有相关检查及 job 的 ISO 时间，验证 job.started <= check.started <= check.finished <= job.finished <= decision。无法定位时间的历史记录使来源拒绝，不能先用未验证字符串排序而把损坏失败隐藏在窗口之后。验证后按数值时间排序，再选连续健康窗口。
- 确认启用时在同一数据库事务内重新验证，调用 draft -> verify -> shadow，保持 enabled=0，再开启 observation。状态变更及私有 jobs 中的 observation_mode 审计记录原子提交，失败全部回滚。已 shadow 来源仅切换 observation；幂等调用不重复记录。保留历史 SourceCheck 和原有 state_json。
- 普通 shadow 来源保留已有单检查门禁；scope/restricted/retired 边界统一检查。自动操作仅处理已 shadow 来源，draft verify 必须走显式确认入口。无 --confirm 不写来源状态；--auto 也要求 --confirm。
- 自动操作在实际修改事务中再次要求 lifecycle=shadow，禁止 draft verify；枚举后变为 draft 时拒绝，不启用。
- 回滚代码时保留已有审计记录；迁移 down 仅删除新增指纹列，随后 up 后旧记录为 null，需重新审计。通过显式关闭 observation 撤销采集。不声明 MySQL 验证通过。
