# 具身数据发展时间线与趋势发现设计

> Date: 2026-09-20  
> Status: Approved  
> Scope: Evolution timeline, embodied-data trends, source-map expansion, and current-event backfill

## 1. 问题

当前公开站已按六段数据生产管线组织 36 个具身数据 Event，但 `/timeline/` 仍是倒序事件列表，不能解释行业阶段、关键转折以及六段管线之间的影响。首页也缺少可持续探索的趋势入口。

现有来源共 36 个，对数据集、基准和 GitHub 开源项目覆盖较多，但对中国数据生产链、数据服务、采集硬件、标准政策、规模化现场和独立核验覆盖不足。现有公开 Event 最新日期为 2025-04-14，与当前时间存在断档。

## 2. 目标与非目标

### 2.1 目标

- 建立“时间阶段 × 六段管线”的具身数据发展脉络。
- 使阶段、转折、趋势、反证和下一信号全部回链公开 Event 与 Evidence。
- 恢复随机探索感，但将对象限定为具身数据主题趋势。
- 将公开来源地图从 36 个扩展到 80–100 个，并完成首批 12–18 个重点来源的真实接入验证。
- 补齐 2025-04-15 至 2026-09-20 的关键公开事件与原始证据。

### 2.2 非目标

- 不恢复通用 AI 六领域、旧 `/lines/` 路由或遗留 `IndustryNarratives` 公开信息架构。
- 不把阶段或趋势变成第二套事实数据。
- 不将新增来源默认标记为 `active`，也不把来源目录条目宣称为已稳定接入。
- 不执行绕过登录、WAF、CAPTCHA、付费墙或 robots 边界的采集。

## 3. 已批准决策

| 决策 | 结果 |
| --- | --- |
| 时间线主组织 | 时间阶段 × 六段管线 |
| 阶段形成机制 | 人工策展，构建期校验 |
| 随机探索对象 | 具身数据主题趋势 |
| 趋势轮换 | 按 Asia/Shanghai 日期每日稳定轮换 |
| 页面结构 | 独立时间线页＋首页摘要 |
| 来源策略 | 中国优先、全球对标 |
| 来源规模 | 80–100 个公开地图条目 |
| 接入深度 | 全量来源地图＋首批 12–18 个重点接入 |
| 新闻时间窗 | 补齐至 2026-09-20 |

## 4. 领域模型

### 4.1 `EvolutionPhase`

`EvolutionPhase` 表达一个经人工审阅的具身数据发展阶段。它不复制 Event 事实，只存储解释与 Event 引用。

```ts
interface EvolutionPhase {
  slug: string;
  start: string;
  end: string;
  title: string;
  thesis: string;
  turningPoint: string;
  eventSlugs: string[];
  stageImpacts: Record<EmbodiedPipelineStage, PhaseStageImpact>;
  counterEventSlugs: string[];
  nextSignals: string[];
}

interface PhaseStageImpact {
  summary: string;
  eventSlugs: string[];
  evidenceState: "supported" | "limited" | "no-public-evidence";
}
```

约束：

- 阶段时间边界必须连续且不重叠。
- 阶段 Event 日期必须落在阶段时间边界内。
- `stageImpacts` 必须显式覆盖六段管线。缺乏公开证据时使用 `no-public-evidence`，不虚构补全。
- `turningPoint` 和反证必须有 Event 支撑。

### 4.2 `EmbodiedTrend`

`EmbodiedTrend` 是跨 Event 的主题判断，用于首页每日探索和时间线的横向导航。

```ts
interface EmbodiedTrend {
  slug: string;
  title: string;
  thesis: string;
  whyNow: string;
  pipelineStages: EmbodiedPipelineStage[];
  eventSlugs: string[];
  counterEventSlugs: string[];
  nextWatch: string[];
}
```

约束：

- 每个趋势至少引用两个已发布 `embodied-data` Event。
- 趋势不存储独立外链。原始证据统一经 Event 回链。
- 趋势可以跨多个管线阶段，但不代替六段管线本身。

### 4.3 位置与输出

- Zod schema 与类型放在具身数据领域模块。
- 策展目录放在 `src/catalog/embodied-data/`，与通用 AI `src/catalog/history.ts` 隔离。
- export 阶段解析 Event 引用，只把 allowlist DTO 写入公开快照。
- 构建期拒绝未知 Event、通用 AI Event、非法日期、重叠阶段和无证据趋势。

## 5. 公开站信息架构

### 5.1 `/timeline/`

`/timeline/` 从“关键变化时间线”升级为“具身数据发展脉络”：

1. 页首展示当前阶段、上一转折和六段管线影响摘要。
2. 阶段导航按时间正序组织。
3. 每个阶段展示主命题、转折、关键 Event 与六段管线影响矩阵。
4. 用户可按管线阶段聚焦；筛选只改变展示，不重写阶段判断。
5. 页尾保留全部 Event 的倒序索引，保证历史事件可发现。

### 5.2 首页

首页新增两个区块：

- **发展脉络摘要**：当前阶段、上一转折、受影响管线和完整时间线入口。
- **今日具身数据趋势**：展示经确定性排序的主题趋势卡，包含判断、关联管线、关键 Event、反证/未知和下一观察。

每日轮换使用 Asia/Shanghai 日期作为种子。所有趋势仍预渲染为静态 HTML；客户端脚本只负责每日排序和交互。无 JavaScript 时显示策展目录的默认顺序。

## 6. 来源地图与重点接入

### 6.1 来源地图

公开来源地图扩展到 80–100 个条目。目标结构约为中国 60%、全球 40%，但不为凑比例降低质量。优先补齐：

- 机器人与模型团队官方源；
- 数据服务、采集运营与现场交付；
- 采集硬件、传感器、遥操与穿戴式设备；
- 数据集、基准、训练与评测；
- 标准、政策、许可、隐私和安全；
- 独立研究、专家与行业核验。

每个来源必须记录 owner、tier、role、region、language、acquisition、license/robots、frequency、authority、freshness SLO、lifecycle 和覆盖主线。公开页分开显示已接入、待接入、受限、替代来源和覆盖缺口。

### 6.2 重点接入

首批选择 12–18 个稳定、高价值来源进入接入验证。优先级顺序：官方 API、RSS/Atom、GitHub Releases、可合规访问的公开页面。

每个新来源按以下流程演进：

```text
draft
  -> compliance review
  -> fixture and contract tests
  -> failure isolation and schema-drift tests
  -> shadow runs and health evidence
  -> shadow
```

本轮不自动晋级 `active`。若真实运行窗口不足，则来源保持 `draft`，并在来源地图如实呈现。

## 7. 事件补齐与阶段策展

### 7.1 研究时间窗

- 补齐窗口：2025-04-15 至 2026-09-20。
- 历史回看：2022 至 2026-09-20，用于校验阶段转折。
- 先按六段管线建立证据表，再提炼 5–7 个候选阶段。
- 阶段边界由人工审阅确定，不根据年份自动切分。

### 7.2 证据门禁

- 公开事实原则上至少有一个 Tier 1 原始证据，或两个相互独立的 Tier 2 证据。
- 聚合站只用于发现候选、聚类和传播提示。
- 不足以进入公开 Event 的内容保留为候选或“待证实”，不填充时间线。
- 同行声明、独立核验、内部判断、推断和预测继续分层表达。

## 8. 错误处理与回滚

- 单个来源失败不中断整批任务；按现有分类记录 timeout、rate limit、schema drift、compliance 和 parser 错误。
- cursor、ETag、Last-Modified 和 fingerprint 只在数据成功持久化后原子推进。
- 新页面与新 DTO 均在构建阶段生成，回滚只需恢复上一个已验证的静态快照与 catalog。
- 任何阶段或趋势引用失效都必须使构建失败，不进入 Pages。

## 9. 测试与验收

### 9.1 领域与完整性

- `EvolutionPhase` 和 `EmbodiedTrend` schema 单元测试。
- Event 引用、日期边界、六段覆盖、反证和内容范围测试。
- 通用 AI Track、旧领域名称和无证据趋势的负向测试。

### 9.2 静态站

- `/timeline/` 包含全部阶段、六段影响和 Event 索引。
- 首页包含发展脉络摘要和具身数据趋势。
- 同一 Asia/Shanghai 日期的趋势顺序稳定，跨日可验证地变化。
- 无 JavaScript 时仍可阅读默认趋势与完整时间线。
- 桌面与移动端无水平溢出，关键链接、焦点顺序和减少动效设置有效。

### 9.3 来源

- 新接入来源具备 fixture、成功路径、失败/降级路径和 schema drift 测试。
- 来源地图数量在 80–100 之间，并显式呈现 lifecycle 和覆盖缺口。
- 不将 `draft` 或未完成真实 shadow 窗口的来源宣称为已稳定运行。

### 9.4 完成命令

- `npm run check`
- `npm run build`
- 公开完整性和静态隐私扫描
- 关键页面桌面/移动端 smoke
- 仓库 `CHANGELOG.md` 与 `src/catalog/product.ts` 同步更新

## 10. 实施顺序

1. 补充领域 schema、catalog 与失败测试。
2. 建立 2022–2026 证据表，补齐 Event，并完成 5–7 个阶段的人工策展。
3. 扩展来源地图，再按覆盖价值选出首批重点接入。
4. 导出新公开 DTO，增加完整性门禁。
5. 改造 `/timeline/`，再增加首页摘要与每日趋势。
6. 完成契约、集成、响应式、隐私与公开完整性验收。

## 11. 主要风险

| 风险 | 控制 |
| --- | --- |
| 阶段变成主观故事 | 先建证据表，再审阅阶段边界；强制 Event 与反证引用 |
| 趋势与事实重复 | 趋势只存储判断和 Event 引用，原始证据只在 Event |
| 扩源变成数量工程 | 公开 lifecycle、覆盖缺口与真实健康证据，不自动晋级 |
| 首页过重 | 首页只放阶段摘要和少量每日趋势，完整内容放在 `/timeline/` |
| 遗留通用 AI 内容泄漏 | 专用 catalog、content-scope 门禁和公开文案负向测试 |

