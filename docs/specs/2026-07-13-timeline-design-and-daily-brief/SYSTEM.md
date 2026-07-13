# 系统设计

## 1. 内容结构

```text
Event（唯一事实）
  ├─ Track（六个决策视角）
  ├─ Evidence（官方、研究、外部佐证）
  ├─ Actor（公司、项目、机构）
  └─ Project transition（active / pivoted / acquired / sunset）

2022—今天
  └─ Era
      ├─ 代表事件
      ├─ 代表产品与项目
      └─ 生命周期变化
```

Track 不复制 Event。旧 `china-catch-up` 在 seed 阶段迁移为 `global-innovation`，保留已有关联；所有 curated track 引用同步替换。

## 2. 抽屉信息路径

```text
标题 + 最新时间 + 类型
  -> 已确认事实
  -> 事情如何发展（全部去重节点）
  -> 技术/产品变化
  -> 行业与商业影响
  -> 当前判断与反向信号
  -> 下一观察
  -> 原始证据 / 完整详情
```

抽屉继续按需读取 `timeline.json`，使用 `textContent` 渲染外部文本。Timeline 节点不预渲染，避免性能回退。

## 3. 星探去重

```text
published Scout
  -> normalize(title + primary evidence slug + kind)
  -> identical fingerprint: keep highest total/evidence/confidence
  -> render sorted by confidence, total, published time
```

去重只影响公开 DTO；数据库保留原始生成记录用于审计。自动发布门禁不降低。

## 4. 日报 Issue

```text
data-refresh (6/day)
  -> collect / cluster / auto publish
  -> export allowlisted JSON
  -> render daily brief for Asia/Shanghai calendar date
  -> find issue marker agent-pulse-daily-brief:YYYY-MM-DD
       found -> update and reopen
       none  -> create daily:brief issue
  -> verify marker, date and OPEN state
  -> snapshot commit -> Pages
```

日报正文只读取 `dist/data/timeline.json`、`dist/data/scout.json`、`dist/data/product.json` 和运行计数，不读取 raw collector payload。

## 5. 视觉约束

- 使用统一 `--space-*`、`--content-width` 与 `--drawer-width` token。
- desktop drawer：`min(760px, 94vw)`；mobile drawer：底部 sheet，最大高度 88vh。
- `reading-journey` 与 `.shell` 同宽，不在中间断到 680px。
- Timeline 末尾保留至少 96px 内容间距，避免贴住 footer。
- Scout 标签左对齐、换行且不以 `justify-content: space-between` 承载元数据。

## 6. 星探公开池

```text
archive expired published cards
  -> count current published cards
  -> gap = max(0, 18 - current)
  -> generate min(requested batch, gap)
  -> six opportunity kinds rotate across ranked Events
  -> existing score/evidence gates
  -> public DTO fingerprint dedupe
```

Data Refresh 每轮请求 12 条候选，但只填补到 18 条公开池水位，不把运行频率直接变成内容膨胀速度。新生成卡 14 天过期；过期归档后由下一轮新事件补位。
