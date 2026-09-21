# 重点来源 HTML 元数据提取契约

日期：2026-09-21。范围：重点来源的离线 fixture 契约与采集配置，不代表政策通过、健康或启用。

## 已批准边界

- 本次重点队列为 12 个来源，6 CN / 6 GLOBAL；Galbot 仅退出试验队列，保留原 catalog 条目。其官网新闻仅提供外部媒体链接，不作为同站 canonical 证据。
- HTML 配置从 catalog 经数据库 config_json 传入 SourceDescriptor。通用适配器不识别来源 slug。
- 复用静态 HTML 解析库的 CSS selector；不执行页面 JavaScript、不加载图片或外部资源。JSON 数据仅允许 JSON.parse 解析指定 script 元素，按明确字段路径读取。
- records selector 确定条目边界。title、link、date 必须归属于当前条目，不跨入嵌套的其他条目；普通嵌套字段容器仍可使用。选择不唯一或缺失时拒绝该条目。必需 link 字段在拼接 prefix 前必须非空且唯一，不能把缺失 slug 变成导航 URL。嵌入 JSON 的 slug 仅能映射到当前页面真实存在的同站链接。
- 显式配置的页面不回退到通用导航链接或页面任意日期。无有效条目视为解析失败。

## 有界详情采集

- 仅显式配置 detail 的来源可以跟随条目链接。每次最多 3 个去重后的同源 HTTPS URL，顺序抓取；保持既有速率、超时、重试和响应体上限。
- 列表请求及每一跳详情 redirect 均使用现有 safe fetcher 的 SSRF 校验，并额外限制 origin。跨域、HTTP 降级、凭据 URL 在请求前拒绝。不能仅在请求完成后检查最终 URL。
- 详情失败使本来源失败；既有外层来源隔离继续负责其他来源。详情不继承列表条件请求头，也不更新列表 ETag/Last-Modified。失败不提交增量状态。
- 审计路径传递相同请求约束且不写采集状态。列表、详情、重试、redirect 与代理重试的实际请求共同使用本轮审计的 source/domain 速率预算，按 rate_limit_per_minute 无突发排队。调度器保持同源/同来源的准入锁，先等待距上次实际发送的间隔，再完成本次 URL/SSRF 校验，随后同步记录发送时刻并调用 fetch；慢 DNS 不得令多个请求同时发送，校验后不再排队。准入锁在调用 fetch 后释放，不等待响应；校验或调用失败也必须释放锁。等待配额和 URL 校验不消耗网络 timeout，既有 Retry-After 与退避仍先满足。规则不修改来源生命周期或启用状态。

## 日期与语义

- 仅使用明确日期字段，拒绝缺年、非法日历日期和缺失日期，不使用当前时间、URL 年份、页面构建时间或正文事件日期。
- 带时区 ISO 时间保留时刻；没有时区的公开日期按日粒度归一化为 UTC 日期标记，并记录 datePrecision=day 与原始字段，不能宣称其为精确发布时间。
- semantic 明确区分 published、created、registered。NIST 使用显式 Created 日期；ITU 使用工作项首次注册日期，不解释为标准批准日期。
- SAMR 使用带“发布时间”标签的可见日期。冲突的 PubDate 作为 dateConflict 元数据保留，不用于覆盖可见日期。fixture 同时保留二者并测试优先级。
- 仅输出标题、URL、日期及解析语义；不保存原文、个人字段、脚本、cookie 或认证信息。

## 验证与回滚

- 每源至少一份真实最小成功 fixture 和一份去日期/漂移 fixture，记录端点与实际采集日期。
- 测试嵌套条目隔离、相邻条目日期污染、重复 URL、未标日期导航、非法日期、JSON/XML 损坏、跨域 redirect、详情数量上限与条件状态隔离。
- SQLite seed→descriptor→adapter 验证配置完整传递。此验证不声明 MySQL 兼容。
- 回滚为还原 catalog 配置和 parser 变更；不修改数据库 schema，不自动启用来源。
