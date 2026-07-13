# 测试方案

## 数据与文案

- 六个战略方向 slug、名称和叙事唯一且一致。
- 全部公开源码文案不包含“中国追赶”或 `China catch-up`。
- 2022 和 2023 curated Event 均有 Tier 1 URL、完整判断字段与趋势关联。
- 项目生命周期状态只允许 `active/pivoted/acquired/sunset`，并有官方 URL。

## 页面

- Timeline 不渲染 `.timeline-intelligence`、近三月密度或论文批次状态。
- 趋势目录和首页六张卡均包含详情按钮。
- 阶段轨迹包含连接箭头和可访问的阶段顺序。
- 筛选显示“官方发布”，不显示“一手证据”。
- 抽屉包含事实、发展、变化、影响、判断、下一观察和证据区；不截断到 4 个节点。
- 390px 下抽屉、Timeline、Scout 标签和 reading journey 无横向溢出。

## 星探

- 相同标题/事件/类型只输出一次，保留得分最高的版本。
- 不同类型的有效机会不被误去重。
- 标签左对齐且第三个指标始终可见。

## 日报

- renderer 只消费 allowlist JSON，转义 Issue Markdown 控制字符并限制条数。
- 同日 marker 幂等更新，不重复建 Issue；跨日创建新 Issue。
- Data Refresh 具有 `issues: write` 最小权限，包含生成、upsert 和 freshness 验证。

## 回归

- `npm run check`
- `npm run build`
- YAML 解析、静态隐私扫描、关键页面 HTTP/内容 smoke
- GitHub Actions 真实运行、日报 Issue 和 Pages 验收

## 追加回归（v0.8.1）

- 首页桌面端 `.home-intro` 为标题 + 紧凑阅读路径双列，820px 以下回到单列。
- 趋势总览标题下渲染六个 `.line-nav` 入口，且不再渲染旧三个状态标签。
- 星探六种 kind 都能生成完整卡片，并继续通过统一发布门禁。
- 公开池不足 18 条时按请求批次补位，达到 18 条时创建数为 0；过期 published 卡先归档。
- Data Refresh 使用 12 条候选批次，公开 DTO 仍无标准化标题重复。
