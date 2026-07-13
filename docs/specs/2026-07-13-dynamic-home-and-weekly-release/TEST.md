# 测试与验收

## 单元与契约

- 公开 Signal 查询排除 raw/完整 summary/triage 等字段，只保留限长纯文本描述，并按时间倒序。
- 静态导出写入全部公开安全 Signal，页面只使用 escape 后的 allowlist 字段。
- 首页包含多个随机趋势候选、紧凑近期变化候选、六个同时可见的趋势块，以及每块内部的 Event 轮播项。
- JS 随机选择、轮播控制、reduced-motion 和无 JS 回退具备 DOM 契约。
- Data Refresh 为每日 cron；Source Audit、Monitor 和 Quality Guard 为每周 cron。
- 周报 marker、标题、label 与 Issue upsert 保持幂等。
- 周报不重复按主线展开同一 Event，不生成 `0 个节点` 小节；关键变化和行动各不超过 3 条，覆盖数据位于折叠区。
- release contract 同时验证 package、CHANGELOG 与网站 Changelog 的 0.10.0。

## 命令

```bash
npm run check
npm run build
npm run release:check
```

## 浏览器

- 桌面 1440px：首页随机趋势、近期变化、轮播与来源观察入口。
- 移动 390px：无横向溢出，轮播可触摸/按钮切换，底部导航可用。
- `/signals/`：独立于事件脉络的右上角多源流入动效、瀑布流、简述、搜索、地域筛选、加载更多和原文链接。
- `/sources/`：411 个来源与组合视图仍可用。

## 线上验收

- CI、Publish GitHub release、Deploy static site 成功。
- 手动运行 source audit，健康摘要 Issue marker 与更新时间更新。
- 手动运行 data refresh（`publish_weekly=true`），当前周只有一个 `weekly-brief` Issue。
- 普通每日 data refresh 不创建日报 Issue，但每次成功运行都会触发 Pages，使站点生成日期保持最新。
- Pages 首页、来源观察、来源页和 Changelog 返回 HTTP 200，并包含 0.10.0 内容。
- 仓库 description、homepage、topics 与 Release 元数据正确。
