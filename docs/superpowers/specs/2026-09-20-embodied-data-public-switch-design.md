# Agent Pulse 具身数据公开切换设计

状态：已完成交互设计确认，待书面规格审阅

日期：2026-09-20

## 1. 目标

将 Agent Pulse 从通用 AI 行业站完整切换为面向具身数据生产运营团队的认知与行动系统。公开产品围绕具身数据生产全链路组织事实、证据、主线、资产、同行和行动建议，帮助用户判断采集技术路线、数据工程方法、行业标准、质量与交付影响。

本次切换必须同时完成：

1. 用真实具身数据来源和精选内容替换公开产品中的通用 AI 来源与当前内容。
2. 让自动收敛、发布 readiness、质量评测和 Scout 只生产具身数据方向的结果。
3. 切换公开页面、导航、SEO、机器可读入口和 GitHub Pages 发布闭环。
4. 保留确定、可验证、无需历史重写的回滚路径。

## 2. 已确认决策

- 品牌保留 `Agent Pulse`，副标题统一为“具身数据情报与生产洞察”。
- 采用可回滚的单产品切换，不建立通用 AI 与具身数据并行频道。
- 首版使用 30–50 个覆盖 2022 年至今的精选 Event，六条主线都必须形成证据基线。
- 新 collector 全部以 `shadow` 进入；精选 launch corpus 可以先公开，新来源必须经过真实观察和契约验收后才能晋级 `active`。
- 同行能力矩阵采用中国优先：8–12 家国内同行和 4–6 家全球标杆，所有声明绑定公开证据。
- 首页采用“管线优先”信息架构，不采用资讯简报优先结构。
- 旧通用 AI 内容不保留公开归档；旧页面进入新的 404 与站内查找路径。
- 旧通用 AI 记录保留在运营 snapshot 中，统一标记为 `legacy-ai` / `retired`，但从默认查询、采集调度、公开 DTO 和页面完全隔离。
- 整个切换使用一个原子 PR，内部按 Phase 3、Phase 4、Phase 5 分组提交。
- 完整交付包括推送、非 Draft PR、合并、Pages 部署、手动工作流和线上验收；不发布 GitHub Release，不 force push。

## 3. 范围

### 3.1 包含

- 具身数据来源目录、覆盖矩阵、生命周期和 collector 契约。
- 精选 Event、Evidence、Actor、Dataset、Standard、CollectionMethod 和 ActorDataCapability 当前数据。
- 六条具身数据生产主线和阶段叙事。
- 具身数据相关性、发布 readiness、质量评测和 Scout。
- 公开 DTO、静态页面、导航、SEO、JSON-LD、sitemap、RSS、`llms.txt` 和 Changelog。
- repository snapshot 重建、恢复、历史 provenance、隐私扫描、工作流和 Pages 验收。
- 迁移基线、可恢复 manifest 和普通 revert 回滚路径。

### 3.2 不包含

- 运行时自动修改 schema、排名、发布门禁或来源生命周期规则。
- 未经真实观察把新来源标记为 `active`。
- 用测试 fixture、设计文档或占位数据填充正式 current snapshot。
- 无证据的同行评分、投资结论或能力排行榜。
- 通用机器人新闻、通用多模态模型新闻或只因出现 VLA/机器人关键词就收录的内容。
- 未经真实集成验证的 MySQL 兼容声明。
- GitHub Release、历史重写、force push 或直接修改 Pages 产物。

## 4. 产品边界

一个公开 Event 必须直接改变至少一个具身数据生产问题：

- 如何定义场景、本体、任务和验收目标；
- 如何进行遥操作、穿戴、自主、仿真、合成或互联网视频迁移采集；
- 如何记录视觉、动作、触觉、力、位姿、关节、语音或语言等模态；
- 如何组织人员、设备、产能、成本、合规与交付；
- 如何完成清洗、同步、标注、格式、版本、互操作和数据治理；
- 如何评估质量、训练有效性、Benchmark、失败样本和反馈闭环。

以下内容默认拒绝：

- 与数据生产无直接关系的通用模型能力、Agent、融资、合作和产品发布；
- 仅讨论机器人策略、控制或本体性能，但不改变数据采集、工程或质量闭环的论文和新闻；
- 只出现“多模态”“VLA”“具身”“机器人”等关键词，但缺少数据生产影响的内容；
- 无来源的规模、成本、质量、客户、产能或交付声明。

## 5. 数据模型与主线

`Event` 继续是唯一事实节点。Dataset、Standard、CollectionMethod、ActorDataCapability 和同行档案只附着结构化解释和证据，不复制 Event 事实。

六条主线与现有 `EmbodiedPipelineStage` 一一对应：

| Stage slug | 公开名称 | 主要问题 |
| --- | --- | --- |
| `demand-definition` | 需求与任务定义 | 采什么、为什么采、如何验收 |
| `acquisition-route` | 采集技术路线 | 数据从哪里来、采用什么生产方式 |
| `multimodal-capture` | 多模态采集设备 | 记录哪些模态、如何同步、设备边界是什么 |
| `production-operations` | 生产运营与成本 | 如何形成稳定产能、控制成本与交付 |
| `data-engineering-standards` | 数据工程与标准 | 如何清洗、标注、格式化、版本化和互操作 |
| `quality-training-feedback` | 质量验收与训练反馈 | 数据是否有效、如何反馈到训练与下一轮采集 |

每条主线必须支持阶段、里程碑、转折、关键 Event、对比、反证、下一信号和阶段总结。同行公司是跨主线视图，不新增第七条主线。

## 6. 来源与 launch corpus

### 6.1 来源覆盖

来源目录至少覆盖：

1. 机器人与具身模型团队；
2. 具身数据公司与采集服务商；
3. 遥操作、传感器、采集设备和数据工具厂商；
4. 数据集、论文、Benchmark 与开源项目；
5. 标准组织、行业协会、政策和采购；
6. 同行公司官方渠道与独立验证来源。

来源必须记录 owner、tier、role、region、language、acquisition、license/robots、frequency、quota、authority、freshness SLO、adapter version、health 和 lifecycle state。新增来源默认 `draft` 或 `shadow`。

旧通用 AI 来源统一进入 `retired`，保留运行历史和 provenance，但从默认查询、data-refresh 调度和公开 DTO 中退出。迁移不得用来源角色或权威分代替 source、author 和 media group 的身份去重。

### 6.2 精选内容

首版 launch corpus 包含 30–50 个 2022 年至今的关键 Event，并同时建立可公开使用的 Dataset、Standard、CollectionMethod、Actor 和同行能力声明。

每个 Event 必须满足以下证据条件之一：

- 至少一个 Tier 1 原始证据；
- 两个相互独立的 Tier 2 证据；
- 例外内容明确标记为“待证实”，且不得进入硬事实摘要、同行能力结论或 Scout 自动公开。

现有自动预览给出的 58 个 include 和 132 个 review 只作为候选线索。迁移必须逐条审核稳定 ID、`content_scope`、DataProfile、Evidence 和主线归属，不能批量自动公开。

### 6.3 同行能力

首版同行矩阵包含 8–12 家国内同行和 4–6 家全球标杆。每条能力声明保存：

- 原始表述与声明方；
- Evidence URL、来源身份和发布时间；
- 对应管线阶段、方法、模态或交付能力；
- `claimed`、`verified` 或 `conflicting` 状态；
- 关联 Event 和失效条件。

厂商自述与独立验证必须分层显示。没有证据的能力格为空，不用推测补齐，也不折算成综合分数。

## 7. 相关性、发布与质量门禁

### 7.1 两级相关性门禁

相关性判断必须同时通过：

1. 具身或机器人本体锚点；
2. 直接改变至少一个具身数据生产问题。

只有关键词命中不能通过门禁。图灵测试、通用多模态 Agent、无数据生产关系的 VLA/机器人论文必须进入负向 golden set。

### 7.2 Event readiness

公开 Event 至少满足：

- `content_scope = embodied-data`；
- 有严格校验的 DataProfile；
- 至少一个 `pipelineStage`；
- 至少一条具身主线；
- Evidence 达到公开证据门槛；
- 事实、推断、观点、预测和机会假设分层；
- 不包含占位洞察、无来源数字或不安全 URL；
- 公开 DTO 不含原始 payload、管理字段、本机路径或私有备注。

任一硬门禁失败时，对象保持 `review` 或进入 `quarantined`，并保留明确 blocker。

### 7.3 领域对象 readiness

- Dataset、Standard 和 CollectionMethod 必须有公开来源和版本/时间边界。
- 数量、规模、成本、质量和采用方等 sourced metric 必须逐项绑定证据。
- ActorDataCapability 必须关联 Event 或 Evidence，Actor 身份本身不能证明能力。
- `claimed` 不得被显示为独立验证；冲突证据不得被平均成确定结论。

### 7.4 Quality Guard

新增以下硬指标：

- 六条主线覆盖；
- Tier 1 证据率；
- DataProfile 完整率；
- 同行能力声明证据率；
- 通用 AI 泄漏数。

通用 AI 泄漏数必须为 0，不能被平均质量分抵消。评测输出必须记录 evaluation time context，PR 使用固定基线，运营检查使用当前时间。

## 8. Scout

Scout 只生成以下具身数据生产机会：

- 技术路线与采集方法；
- 采集设备与多模态记录；
- 生产组织、产能、成本与交付；
- 数据标准、格式和互操作；
- 质量验收、Benchmark 与训练反馈；
- 同行、合作、产品和内容机会。

每条 Scout 建议必须绑定已公开 Event 与 Evidence，并包含目标用户、为什么是现在、非共识点、建议产物、首个小实验、风险和失效条件。未达到总分、证据、置信度、新颖度和公开 Event 绑定门禁时，只能保存在私有状态。

## 9. 公开信息架构

### 9.1 品牌与导航

品牌名保持 `Agent Pulse`，副标题为“具身数据情报与生产洞察”。主导航固定为：

1. 关键变化；
2. 数据管线；
3. 数据资产；
4. 行业同行；
5. 来源地图；
6. 行动建议。

时间线作为关键变化和数据管线页面中的明确入口，不占主导航第一层。模型价格入口和通用 AI 页面生成全部移除。

### 9.2 首页

首页采用管线优先结构：

1. 当期最重要的数据生产变化；
2. 六段数据生产管线；
3. 关键证据链；
4. 数据资产、行业同行、来源地图和行动建议四个决策视图。

现有通用 AI 六领域轮播不再生成。视觉上保留当前静态站的轻量骨架和交互方式，以“六段管线轨道”作为新的核心识别，不做无关视觉重构。

### 9.3 页面

- 数据管线：展示六条主线的阶段、里程碑、关键 Event、对比、反证和下一信号。
- 数据资产：统一浏览 Dataset、Standard 和 CollectionMethod，并回链 Event 与 Evidence。
- 行业同行：按管线覆盖和证据状态横向比较，不显示无证据综合排名。
- 来源地图：显示国内/海外、官方/独立、类型、覆盖缺口与 lifecycle state。
- Event：展示 DataProfile、管线影响、相关 Dataset/Standard/CollectionMethod、事实边界和 Evidence。
- 行动建议：只展示具身数据生产 Scout 结果。
- Changelog：同步本次切换、能力边界和未完成项。

旧通用 Event 和 Track URL 不保留可浏览内容，统一进入新的 404 和站内查找路径。

### 9.4 机器可读与可访问性

同步更新中英文 SEO、Open Graph、JSON-LD、sitemap、RSS、`llms.txt`、公开 DTO 和站点 Changelog。页面必须满足响应式、键盘焦点、reduced motion、语义 HTML 和静态导出隐私边界。

## 10. 数据迁移与 snapshot

### 10.1 基线

迁移前记录：

- `main` Git SHA；
- `data/snapshot/v1.json` SHA-256；
- 公开内容指纹；
- Source、Signal、Event、Evidence、Track、Actor、Resource 和 Scout 数量；
- 当前 Pages URL 和最后一次成功部署。

基线 manifest 只保存恢复所需元数据，不重复提交大型旧 snapshot。固定 Git revision 是完整恢复源。

### 10.2 迁移

迁移顺序：

1. 恢复当前 snapshot 并验证基线指纹。
2. 按稳定 ID 和 `content_scope` 审核 launch corpus。
3. 写入精选 Event、Evidence、DataProfile 和领域对象。
4. 写入六条主线、同行能力和具身 Scout。
5. 将通用 AI Source 标记为 `retired`，将其 Signal 和 Event 保持为 `legacy-ai`，禁用旧 Track、Resource 和 Scout 的默认产品入口；历史 provenance 继续保存在运营 snapshot。
6. 重新生成 snapshot、评测和公开 DTO。
7. 从新 snapshot 恢复到空 SQLite，并验证对象计数、关系、隐私和公开指纹。

公开 DTO、默认 Repository 查询、data-refresh 和静态页面必须排除所有 `legacy-ai` / `retired` 记录。不得手工编辑大型 snapshot，不得按标题关键词直接删除。

### 10.3 自动刷新

data-refresh 只调度具身目录中的 active 来源和已批准的 shadow observation。自动对象先进入 shadow/review；失败不推进 cursor，单来源失败不影响 launch corpus 的公开稳定性。

## 11. 实施分包

### Phase 3：来源与 launch corpus

- 建立具身来源目录、覆盖矩阵和 shadow collector。
- 建立 30–50 个精选 Event 与领域对象。
- 建立中国优先的同行能力矩阵。
- 完成迁移基线、旧数据软退役、公开隔离和新 snapshot round-trip。

退出条件：来源契约、许可检查、内容证据、领域对象、snapshot 恢复和隐私扫描通过。

### Phase 4：门禁与 Scout

- 完成两级相关性门禁和正负 golden set。
- 完成 Event/领域对象 readiness 和质量评测。
- 完成具身 Scout 生成、公开门禁和拒绝回归。
- 更新 data-refresh、source-audit、quality-guard 和 monitor 的领域断言。

退出条件：公开对象全部满足 scope、管线阶段、主线、证据和领域字段门禁，通用 AI 泄漏数为 0。

### Phase 5：公开产品与发布

- 完成首页、导航、数据管线、数据资产、行业同行、来源地图、Event 和 Scout 页面。
- 更新中英文 SEO、JSON-LD、sitemap、RSS、`llms.txt` 和 Changelog。
- 完成静态导出、浏览器 smoke、Pages 发布和线上验收。

退出条件：本地、CI、Pages 和线上站点四层证据一致，旧通用 AI 内容与入口不再公开。

## 12. 测试与验收

### 12.1 TDD

所有稳定、可观察行为先写失败测试并观察预期失败，再写最小实现。测试至少覆盖：

- 真实具身数据样本通过相关性门禁；
- 通用多模态、Agent、图灵测试和无数据生产关系的机器人论文被拒绝；
- 无 DataProfile、管线阶段、Evidence 或安全 URL 的对象被 readiness 阻断；
- 厂商自述不会显示成独立验证；
- snapshot 写入、恢复、合并和 legacy snapshot 兼容；
- current snapshot 保留 `legacy-ai` / `retired` 历史 provenance，但所有公开 DTO、默认查询和静态页面都不包含通用 AI Track、Event、Scout 或模型价格资源；
- 公开 DTO 只输出 allowlist 字段；
- 所有主导航页面、Event 页面和 404 可静态生成；
- sitemap、RSS、`llms.txt`、JSON-LD 和 Changelog 与新定位一致；
- data-refresh 不调度已退出的通用 AI 来源；
- 新来源不会自动从 `shadow` 晋级 `active`；
- 任一来源失败不推进 cursor，也不破坏整批任务。

### 12.2 本地硬验收

- 相关单测完成红绿验证；
- `npm run check`；
- `npm run build`；
- snapshot restore/round-trip；
- 静态导出与隐私扫描；
- 关键路由桌面和移动端浏览器 smoke；
- 通用 AI 泄漏扫描；
- 迁移前后对象计数、指纹与回滚演练。

### 12.3 线上硬验收

合并后等待 CI 与 Pages 成功，并访问公开站确认：

- HTTP 200；
- 品牌副标题、六条管线和主导航已切换；
- 数据资产、同行、来源、Scout、Event、Changelog 和机器可读入口已上线；
- 旧通用 AI 标题、六领域轮播和模型价格入口不再出现；
- 网站 Changelog 已记录本次用户可感知变化。

随后手动运行 `source-audit.yml`、`quality-guard.yml`、`data-refresh.yml` 和 `monitor.yml`，等待其真实完成，再次验证 snapshot、Pages 和线上内容。

## 13. 发布与回滚

### 13.1 发布

- 从最新 `origin/main` 创建 `codex/embodied-data-public-switch`。
- 使用一个非 Draft PR 原子交付，提交按 Phase 3、Phase 4、Phase 5 分组。
- PR CI 未通过时不得合并。
- 合并前同步 `main`，重新运行本地硬验收。
- 合并后等待 Pages 和手动运营工作流全部完成。
- 不创建 GitHub Release。

### 13.2 回滚

任一线上硬门禁失败时停止后续工作流，创建普通 revert PR：

1. revert 原子切换 PR；
2. 从基线 Git SHA 恢复 snapshot、目录和静态页面；
3. 运行 `npm run check`、`npm run build` 和 snapshot restore；
4. 合并回滚 PR 并等待 Pages；
5. 验证公开指纹回到基线。

禁止 `git reset --hard`、历史重写和 force push。

## 14. 完成标准

只有同时满足以下条件，才能声明具身数据公开切换完成：

- 30–50 个精选 Event 和首批领域对象已进入 current snapshot，旧通用 AI 记录仍可按 `legacy-ai` / `retired` 审计；
- 六条主线都有证据基线；
- 8–12 家国内同行和 4–6 家全球标杆有证据化能力档案；
- 所有新 collector 保持 `shadow`，除非另有真实观察与晋级证据；
- 通用 AI 泄漏数为 0；
- 本地完整检查、CI、Pages、手动运营工作流和线上浏览器验收全部通过；
- 根目录 `CHANGELOG.md` 与 `src/catalog/product.ts` 已同步；
- 回滚 manifest 和普通 revert 路径已经验证；
- 没有 `.env`、token、cookie、原始 payload、本机路径、私有 feed 或个人数据进入仓库和 Pages。
