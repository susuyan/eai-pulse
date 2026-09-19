# 具身数据认知系统开发指南

状态：方向已确认，领域基础包已完成，公开产品尚未切换
日期：2026-09-19  
适用对象：产品、数据、采集运营、研究与研发团队

首个实施包：

- [PRD](PRD.md)
- [SYSTEM](SYSTEM.md)
- [TEST](TEST.md)
- [TASKS](TASKS.md)
- [Implementation Plan](../../superpowers/plans/2026-09-19-embodied-data-foundation.md)

第二个实施包：

- [Domain Objects PRD](DOMAIN-OBJECTS-PRD.md)
- [Domain Objects System](DOMAIN-OBJECTS-SYSTEM.md)
- [Domain Objects Test](DOMAIN-OBJECTS-TEST.md)
- [Domain Objects Tasks](DOMAIN-OBJECTS-TASKS.md)
- [Domain Objects Implementation Plan](../../superpowers/plans/2026-09-19-embodied-data-domain-objects.md)

## 1. 直接结论

本项目应从“通用 AI 行业认知系统”垂直重构为“具身智能数据板块的认知与行动系统”。

核心用户是具身数据生产运营团队。系统首先帮助团队判断技术路线与行业标准，同时持续观察同行公司、上下游供需和行业变化。核心问题不是“AI 行业发生了什么”，而是：

1. 哪些具身任务正在产生新的数据需求？
2. 数据应采用什么采集技术路线、设备与模态？
3. 数据如何生产、治理、验收和版本化交付？
4. 哪些标准正在形成，哪些标准正在被真实采用？
5. 同行公司覆盖哪些环节，其能力声明有何证据？
6. 哪些变化会影响采集成本、质量、产能与训练效果？

现有 `Source -> Signal -> Event -> Evidence -> Narrative / Scout -> Static Site` 骨架继续使用。需要替换的是领域本体、内容目录、提取规则、评分门禁、公开信息架构和当前数据，而不是重写采集、证据、来源生命周期和静态发布基础设施。

## 2. 当前项目基线

### 2.1 可复用能力

- Node.js 22+、TypeScript、Fastify、Kysely 和 SQLite 默认数据库。
- 统一 `SourceAdapter`、安全抓取、限流、条件请求和来源健康记录。
- `Signal` 去重、聚类为 `Event`，并保留 Evidence 与 provenance。
- `Event` readiness、自动收敛、人工审核和确定性发布门禁。
- 私有 Control Room 与公开静态 DTO 分离。
- 静态站、GitHub Pages、快照、隐私扫描、Changelog 和发布工作流。

### 2.2 必须替换的通用 AI 内容

- `src/db/seed.ts` 中的通用 AI Track、Actor、Model Resource 和示例 Event。
- `src/catalog/` 中以通用模型、Agent、资本和模型价格为中心的目录数据。
- `src/catalog/history.ts` 及相关历史事件与通用 AI Narrative。
- `src/pipeline/ai-enrichment.ts` 中的通用 AI Event 提取提示词和字段语义。
- `src/pipeline/scout.ts` 中面向创业、媒体、学习和影响力的通用行动模板。
- `src/pipeline/static-site/pages.ts` 与 `i18n.ts` 中的栏目、页面和产品文案。
- `src/catalog/product.ts` 中与旧定位绑定的能力、路线图和版本描述。

### 2.3 迁移前实测数据规模

截至 2026-09-19，版本化快照包含：

| 对象 | 数量 |
| --- | ---: |
| Source 状态记录 | 416 |
| Signal | 15,779 |
| Event | 4,128 |
| Published Event | 538 |
| Review Event | 3,590 |
| Scout Insight | 43 |

这些数量只用于迁移基线，不代表具身数据覆盖质量。按标题与分类关键词进行的初步盘点命中 15 个已发布和 237 个 review 状态的具身相关 Event；该结果是启发式库存，不可直接作为迁移白名单。

定时 `data-refresh`、`source-audit`、`quality-guard` 和 `monitor` 当前已暂停，只保留手动触发。迁移验收必须显式运行工作流，不能假设定时任务会验证新方向。

迁移前基线还存在一个需要先处理的测试失败：2026-09-19 执行 `npm run check` 时，`tests/scout.test.ts` 的“至少生成 4 种机会类型”断言实际得到 3 种；其余 339 项测试通过。该失败在单独复跑时稳定重现，与本指南的文档变更无关。Phase 0 必须先修复该问题，或把它登记为经确认的基线例外；不得在失败仍未解释时宣称迁移基线通过。

## 3. 产品边界

### 3.1 收录原则

一个公开 Event 必须直接改变至少一个具身数据生产问题：

- 数据需求或任务定义；
- 采集方法、设备、模态或作业方式；
- 数据格式、Schema、同步、标定、存储、版本或血缘；
- 数据质量、标注、验收或训练反馈；
- 生产成本、产能、良率、返工或交付边界；
- 行业标准、许可、隐私、安全或合规；
- 同行公司的数据能力、项目、客户、产能或技术路线。

模型、机器人本体、融资、政策和合作事件只有在满足上述条件时才能进入公开主线。

### 3.2 不收录内容

- 与数据生产链路无关的通用模型发布或榜单变化；
- 没有数据影响的机器人新品和演示；
- 没有可核验证据的公司宣传、规模声明和领先判断；
- 仅有聚合站或转载支持的重大事实；
- 无法说明数据需求、技术路线、质量、成本或标准影响的泛行业新闻；
- 第三方完整正文、受限内容、登录后内容或无法确认许可的数据。

### 3.3 内容表达

每个公开 Event 应回答：

1. 发生了什么？
2. 证据是什么？
3. 影响哪一段数据管线？
4. 对技术路线或行业标准意味着什么？
5. 对生产运营、成本、质量或交付意味着什么？
6. 哪个下一信号会加强、削弱或推翻当前判断？

事实、推断、同行声明、内部判断、预测和待验证假设必须分开。

## 4. 六条具身数据主线

| 主线 | 核心问题 | 典型内容 |
| --- | --- | --- |
| 需求与任务定义 | 需要生产什么数据，服务什么能力？ | 场景、任务原子、能力目标、数据缺口、采购需求 |
| 采集技术路线 | 数据从哪里来，采用什么生产方式？ | 遥操作、穿戴式、自主采集、仿真/合成、互联网视频迁移 |
| 多模态与采集设备 | 采什么信号，如何保证可用？ | RGB/RGB-D、点云、力/触觉、关节状态、IMU、音频、同步与标定 |
| 生产运营与成本 | 如何稳定、规模化地生产？ | 场地、设备、人效、良率、产能、返工、安全、单位有效小时成本 |
| 数据工程与行业标准 | 如何形成可交换、可追溯的数据资产？ | Schema、坐标系、时间戳、元数据、存储、版本、血缘、许可、互操作 |
| 质量验收与训练反馈 | 什么是有效数据，如何证明价值？ | 完整性、一致性、多样性、覆盖、泄漏、验收、训练增益与失败分析 |

主线是 Narrative，不是普通标签。每条主线应支持阶段、里程碑、转折、对比、反证、下一信号和阶段总结。

场景、本体、任务、模态、采集方式、地区和成熟度是跨主线维度。它们附着到同一 Event，不复制事实。

## 5. 同行公司与行业视图

同行公司和行业格局是贯穿六条主线的横向视图，不单独变成第七条主线。

### 5.1 公司档案

每家公司档案至少包含：

- 公司定位与区域；
- 目标客户与服务场景；
- 覆盖的数据管线环节；
- 支持的本体、任务、模态与采集方式；
- 公开的产能、规模、质量和交付声明；
- 数据格式、标准、工具和生态关系；
- 代表项目、合作、客户、数据集与证据；
- 声明状态、证据状态、核验日期和置信度。

“公司已收录”“公司自称具备能力”和“能力已被独立证据验证”必须是三个不同状态。

### 5.2 能力矩阵

同行比较使用六条主线作为列，以公司为行。矩阵中的每个结论必须回链到 Event 或 Evidence。未知值使用 `待核验`，不得以评分或宣传稿补齐。

### 5.3 行业供需

行业视图重点观察：

- 机器人公司和模型团队的数据需求变化；
- 数据服务商的供给、产能和交付方式；
- 采集设备、传感器、遥操作和数据工具厂商；
- 标准组织、研究机构和开源生态；
- 采购、许可、隐私、安全和政策变化；
- 行业合作、客户验证、融资和扩产对数据业务的实际影响。

## 6. 目标领域模型

### 6.1 保留 Event 单一事实节点

`Event` 继续记录事实、证据、时间、主体、判断与下一信号。Dataset、Standard、CollectionMethod 和 Company 不复制 Event 事实，只通过关系表引用 Event。

### 6.2 新增领域对象

#### DataProfile

每个具身数据 Event 的结构化领域描述：

- `pipelineStages`
- `scenarios`
- `embodiments`
- `tasks`
- `modalities`
- `acquisitionMethods`
- `dataFormats`
- `standards`
- `scaleClaims`
- `qualityMetrics`
- `costSignals`
- `deliveryImpact`
- `evidenceStatus`

推荐使用受控词表和关系表表达稳定维度；仍在快速演进的细节可以先使用经 Zod 校验的 JSON。不要把所有字段都堆入 `events` 表。

#### Dataset

数据集是长期资产，不是一次发布事件。建议字段：

- 名称、版本、发布方、时间和 canonical URL；
- 场景、本体、任务、模态与采集方式；
- 规模及其单位、时长、轨迹/episode、帧率与采样率；
- 传感配置、同步、标定、Schema、标注和质量方法；
- License、访问方式、下载状态和使用限制；
- 训练/评测用途、已知结果、限制和失效条件；
- 相关 Event 与 Evidence。

#### Standard

标准对象同时覆盖正式标准和事实标准，但两者必须显式区分：

- 标准类型、组织、版本与状态；
- 适用管线阶段；
- Schema、坐标系、时间同步、元数据与接口；
- 实现、兼容工具、采用方与迁移要求；
- 相关 Event、Evidence 与核验时间。

#### CollectionMethod

采集技术路线对象记录：

- 适用场景、本体与任务；
- 所需设备、操作角色和环境；
- 可采模态与数据质量边界；
- 吞吐、成本、部署复杂度和安全风险；
- 优势、限制、失败模式、成熟度与证据。

#### PeerCompanyProfile

在现有 `Actor` 基础上增加具身数据能力档案。能力声明必须保留原文、来源、时间、声明方、核验状态和关联 Event，不应只保存最终分数。

### 6.3 建议的 Schema 方向

优先新增以下表或等价关系：

```text
event_data_profiles
datasets
dataset_events
standards
standard_events
collection_methods
collection_method_events
actor_data_capabilities
actor_capability_evidence
```

同时为 Event、Signal、Source 和 Actor 增加明确的 `content_scope` 或等价字段，至少支持：

```text
embodied-data
legacy-ai
```

`content_scope` 用于可审计迁移和发布过滤。禁止用标题关键词直接删除或公开数据。

## 7. 目标数据流

```text
具身数据来源与行业发现
          |
          v
SourceAdapter -> Signal -> 具身数据相关性门禁
          |
          v
去重 / 聚类 -> Event -> DataProfile 提取与校验
          |
          +-> Dataset / Standard / CollectionMethod / Actor 关联
          |
          v
Evidence + 冲突检测 + Readiness + 领域质量门禁
          |
          v
六条主线 / 同行能力矩阵 / Scout 行动
          |
          v
allowlist DTO -> 静态站 -> GitHub Pages
```

### 7.1 具身数据相关性门禁

公开 Event 至少满足：

- `content_scope = embodied-data`；
- 至少关联一个具身数据管线阶段；
- 至少关联一条六主线；
- 明确说明对技术路线、标准、质量、成本或交付的影响；
- 满足现有一手证据与多源证据规则；
- 不含占位内容和无法核验的规模声明。

### 7.2 评分调整

保留 confidence 与传播证据，但不要让通用热度压过业务价值。建议把领域价值拆为可解释因子：

- `pipelineRelevance`
- `technicalRouteImpact`
- `standardImpact`
- `productionImpact`
- `qualityImpact`
- `evidenceStrength`
- `peerRelevance`
- `freshness`

新评分必须先建立人工标注 golden set，再修改排名或发布阈值。不得把设计字段或人工预填分数写成已测量结果。

## 8. 页面与导航

| 页面 | 新职责 | 主要数据 |
| --- | --- | --- |
| 首页 | 最近最重要的数据生产变化、路线判断与标准变化 | Event、Narrative、Standard |
| 六条主线 | 展示每条具身数据主线的阶段、转折和下一信号 | Track、Event、Evidence |
| 事件时间线 | 浏览具身数据事实与研究进展 | Event、DataProfile |
| 数据资产与工具 | 数据集、标准、采集方案和工具目录 | Dataset、Standard、CollectionMethod |
| 行业与同行 | 公司档案、能力矩阵、供需和行业变化 | Actor、PeerCompanyProfile、Event |
| 来源地图 | 数据公司、机器人公司、研究机构、标准组织和设备厂商 | Source、SourceCheck |
| 行动建议 | 技术路线验证、标准跟进、采集实验和质量改进 | Scout、Event |
| 产品与 Changelog | 系统能力、评测、边界和版本变化 | Product Catalog、Release |

现有“模型价格”页面应退出主导航，由“数据资产与工具”替代。旧通用 AI 页面和数据从当前产品与当前数据中移除，不继续混合展示。

## 9. 代码改造地图

### 9.1 规格与产品边界

- `AGENTS.md`：更新项目使命、事实边界、主线、同行和完成标准。
- `README.md`、`README-zh-cn.md`：更新定位、页面说明与运行边界。
- `docs/ARCHITECTURE.md`：更新领域层与目标数据流。
- `docs/SOURCES.md`：增加具身数据来源分类与合规边界。
- `docs/CAPABILITIES.md`、`docs/ROADMAP.md`：重写能力地图与成熟度目标。

### 9.2 Schema 与 Repository

- `src/db/migrations/`：新增可回滚 migration，不修改旧 migration。
- `src/db/types.ts`：增加领域对象与关系表类型。
- `src/db/repository.ts`：新增按 `content_scope`、管线阶段和领域对象查询接口。
- `src/domain/types.ts`：扩展公开 DTO，保持私有字段不进入公开层。

### 9.3 目录、Seed 与当前数据

- `src/db/seed.ts`：替换 Track、Actor、Resource 和示例 Event。
- `src/catalog/sources.ts`：建立具身数据与同行来源目录。
- `src/catalog/history.ts` 及历史文件：改为具身数据发展基线。
- `src/catalog/product.ts`：同步产品能力、路线图、Unreleased Changelog 数据。
- `data/snapshot/v1.json`：通过迁移、清理和重新生成更新，禁止手工编辑大文件。

### 9.4 收敛、评分与发布

- `src/pipeline/ai-enrichment.ts`：替换为具身数据 Event 与 DataProfile 的严格 Schema 提取。
- `src/pipeline/readiness.ts`：新增 content scope、管线阶段和领域完整性 blocker。
- `src/pipeline/quality.ts`、`src/domain/scoring.ts`：新增领域相关性与技术/标准影响评分。
- `src/pipeline/scout.ts`：改为技术路线、标准、采集实验和质量改进建议。
- `src/pipeline/export.ts`：导出新的 allowlist DTO，过滤旧 scope。
- `src/pipeline/snapshot.ts`：加入新表、敏感字段清理和确定性恢复。

### 9.5 静态站

- `src/pipeline/static-site/dto.ts`：新增领域 DTO。
- `src/pipeline/static-site/intelligence.ts`：新增数据资产、标准、同行能力和主线聚合。
- `src/pipeline/static-site/pages.ts`：调整页面、SEO、JSON-LD 与导航。
- `src/pipeline/static-site/i18n.ts`：同步中英文产品文案。
- `web/public/assets/`：只在信息架构稳定后调整样式和交互。

### 9.6 工作流与发布

- `.github/workflows/data-refresh.yml`：验证新对象生成、快照合并和公开指纹。
- `.github/workflows/source-audit.yml`：审计具身来源并维护健康摘要。
- `.github/workflows/quality-guard.yml`：监测具身覆盖与证据质量回退。
- `.github/workflows/monitor.yml`：检查手动审计与 Pages 新鲜度。
- `CHANGELOG.md` 与 `src/catalog/product.ts`：所有用户可感知变化双写。

## 10. 分阶段实施

### Phase 0：建立迁移基线

目标：先可回滚，再修改。

工作：

1. 记录 Git revision、版本、快照 hash、对象数量和当前公开 URL。
2. 运行当前 `npm run check` 与 `npm run build`，保存真实结果。
3. 生成只用于迁移回滚的快照和公开内容指纹。
4. 定义旧内容删除清单，按稳定 ID 和 `content_scope` 审核，不按关键词删除。

退出条件：基线可恢复到临时 SQLite，并能生成与迁移前一致的公开指纹。

### Phase 1：Docs-first 与词表

目标：先统一语言和收录边界。

工作：

1. 新增 PRD、SYSTEM、TEST 和 TASKS。
2. 确认六条主线、管线阶段、场景、本体、任务、模态、采集方式和标准类型词表。
3. 定义 Event 收录/拒绝样本和同行能力声明状态。
4. 定义页面信息架构、公开 DTO 和删除边界。

退出条件：同一个样本由不同编辑者处理时，收录结论与主线分类基本一致。

### Phase 2：领域 Schema 与迁移

目标：建立可审计、可扩展的领域对象。

工作：

1. 先写 migration、Repository 和 DTO 失败测试。
2. 新增 DataProfile、Dataset、Standard、CollectionMethod 和 PeerCompanyProfile。
3. 新增 `content_scope` 与受控词表校验。
4. 实现向前迁移、回滚或安全降级方案。
5. 更新 snapshot 写入、恢复、合并和隐私清理。

退出条件：SQLite 迁移、Repository 契约、快照 round-trip 和隐私扫描通过。MySQL 未完成真实集成前不得声明兼容。

### Phase 3：来源地图与领域内容

目标：用真实具身数据来源替换通用 AI 目录。

来源至少覆盖：

- 机器人与具身模型团队；
- 具身数据公司和采集服务商；
- 遥操作、传感器、采集设备与数据工具厂商；
- 数据集、论文、Benchmark 与开源项目；
- 标准组织、行业协会、政策与采购；
- 同行公司官方渠道与独立验证来源。

工作：

1. 建立来源覆盖矩阵和缺口状态。
2. 新来源默认 `draft` 或 `shadow`。
3. 每个 adapter 提供 fixture、成功、失败、漂移和降级测试。
4. 建立首批 Dataset、Standard、CollectionMethod、Actor 和具身历史 Event。
5. 清理通用 AI source、seed 和当前数据，但保留迁移回滚备份。

退出条件：来源契约、许可检查、真实观察窗口和领域覆盖验收通过后，来源才能进入 `active`。

### Phase 4：收敛、门禁与 Scout

目标：让自动流程只生产具身数据认知。

工作：

1. 建立具身数据 Event 分类 golden set。
2. 增加相关性门禁、DataProfile 提取和冲突检测。
3. 调整评分与发布 readiness。
4. 改造 Scout 输出类型与行动模板。
5. 增加无关通用 AI 内容的拒绝回归测试。

退出条件：公开 Event 全部满足 scope、管线阶段、主线、证据和领域字段门禁；无证据的公司能力声明不会变成公开事实。

### Phase 5：公开产品切换

目标：让页面、导航和内容真正体现新定位。

工作：

1. 切换首页、六主线、时间线、数据资产、行业同行、来源地图和 Scout。
2. 更新中英文 SEO、JSON-LD、`llms.txt`、sitemap 和 404。
3. 移除模型价格与通用 AI 页面入口。
4. 更新 README、产品能力、Roadmap 和双 Changelog。
5. 对概念性数据和未完成页面明确标记，不将 seed 当生产能力。

退出条件：静态导出、隐私扫描、关键路由、移动端和桌面端浏览器 smoke 通过。

### Phase 6：切换、清理与发布

目标：完成产品与当前数据的垂直切换。

工作：

1. 在临时数据库执行迁移和删除 dry-run，输出对象数量和稳定 ID 清单。
2. 审核后从当前数据库、seed、snapshot、catalog 和公开页面移除通用 AI 内容。
3. 重新生成快照、来源健康报告、系统评测与静态站。
4. 执行 `npm run check` 与 `npm run build`。
5. 手动触发 `source-audit.yml`、`data-refresh.yml`、`quality-guard.yml` 和 `monitor.yml`。
6. 等待 CI 与 Pages 成功后，访问公开站核验定位、页面、数据和 Changelog。

退出条件：仓库、快照、公开站和 Changelog 都只呈现新的具身数据定位；回滚包能够恢复迁移前状态，但不进入新产品和当前数据。

## 11. 测试策略

### 11.1 单元测试

- 受控词表与 Zod Schema。
- 具身相关性分类与拒绝原因。
- DataProfile、Dataset、Standard 和 CollectionMethod 校验。
- 评分因子、排序稳定性和手工覆盖审计。
- 同行能力声明状态与证据关联。

### 11.2 集成测试

- Source -> Signal -> Event -> DataProfile -> Published DTO。
- migration、Repository 和 snapshot round-trip。
- 单来源失败不阻断批次，失败不推进 cursor。
- 旧 scope 不进入新公开 DTO。
- Dataset、Standard、Company 与 Event 不复制事实。
- 删除迁移只作用于审核过的稳定 ID。

### 11.3 内容 golden set

至少包括：

- 明确应收录的具身数据事件；
- 明确应拒绝的通用 AI 和泛机器人事件；
- 同时影响模型与数据、但应按数据影响收录的边界样本；
- 公司自报产能、独立验证和冲突证据样本；
- 正式标准、事实标准和仅为项目格式的区分样本；
- 不同采集方式、模态、场景和本体组合。

### 11.4 浏览器验收

- 首页能在首屏说明“具身数据采集全链路认知系统”。
- 六条主线可进入，且不再显示通用 AI 主线。
- 数据资产页可区分 Dataset、Standard、CollectionMethod 和 Tool。
- 行业与同行页的每个能力结论可打开证据。
- 搜索与筛选可按场景、本体、任务、模态、采集方式、公司和标准工作。
- Event 详情明确分开事实、数据影响、技术/标准判断、运营影响和下一信号。
- 页面不泄漏数据库、token、原始 payload、本机路径或私有备注。

## 12. 完成定义

一次具身数据方向变更只有在以下条件全部满足时才算完成：

- 对应 PRD、SYSTEM、TEST 和 TASKS 已更新；
- Schema、migration、Repository、DTO 和回滚方案一致；
- 具身来源有 fixture、contract、真实观察和生命周期证据；
- 公开 Event 全部通过一手证据、具身相关性和领域完整性门禁；
- 同行能力声明保留来源、时间、原值、核验状态和审计记录；
- 通用 AI 内容已从产品与当前数据移除；
- `npm run check`、`npm run build`、静态隐私扫描和浏览器 smoke 通过；
- `CHANGELOG.md` 与 `src/catalog/product.ts` 同步；
- 手动工作流、CI、Pages 和公开站均完成真实验收；
- 未实现、未验证和实验能力仍被明确标注。

## 13. 首个实施包建议

不要从首页改文案开始。首个实施包应只完成以下闭环：

1. 新规格与受控词表；
2. `content_scope` 与 DataProfile schema；
3. 三类 Dataset、三类 Standard、三类 CollectionMethod 的真实 fixture；
4. 一组收录/拒绝 golden set；
5. 新旧内容双跑但仅生成预览，不切生产站；
6. 预览通过后再进入来源替换与公开产品切换。

这个顺序先验证领域模型和内容门禁，再投入页面与大规模数据迁移，可显著降低返工和误删风险。
