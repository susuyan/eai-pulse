# TEST：具身数据认知系统领域基础

## 1. 测试原则

- 所有稳定行为先失败、后实现、再通过。
- 领域 Schema、数据库约束、快照兼容和预览只读边界分别测试。
- golden set 使用明确输入和预期结论，不以当前生产数据数量作为断言。
- 私有预览通过文件位置、字段 allowlist 和公开指纹证明不会影响公开站。

## 2. 单元测试

### 受控词表与 DataProfile

```bash
npm test -- --run tests/embodied-data-domain.test.ts
```

验收：合法 scope、管线阶段、模态和采集方式通过；未知值、空管线阶段、非 HTTPS、带 userinfo 或查询参数的证据 URL 和额外字段失败。

### 相关性 golden set

```bash
npm test -- --run tests/embodied-data-relevance.test.ts
```

验收：三个 include、三个 review、三个 reject 样本得到精确结论和管线阶段；原因使用稳定机器码。

## 3. 数据库与快照测试

```bash
npm test -- --run tests/embodied-data-schema.test.ts
npm test -- --run tests/snapshot.test.ts
```

验收：

- 四个 scope 列默认 `legacy-ai`；
- DataProfile 外键级联删除；
- Repository 写入与读取执行双向 Schema 校验；
- DataProfile upsert 并发幂等，未知 schema version、缺失 Event 引用和非法时间戳失败；
- 新字段完成 snapshot round-trip；
- 旧快照缺少新字段时仍可恢复。

## 4. 私有预览测试

```bash
npm test -- --run tests/embodied-data-preview.test.ts
npm run preview:embodied
```

验收：

- 输出 `include`、`review`、`reject` 和 `profiled` 计数；
- items 按 slug 稳定排序；
- 不输出 raw payload；
- 输出位于 `var/embodied-data-preview.json`；
- 运行前后公开内容指纹不变；
- 预览文件不会出现在 Git 状态中。

## 5. 基线与全量回归

```bash
npm test -- --run tests/scout.test.ts
npm run check
npm run build
```

验收：Scout 10 项测试全部通过；完整 lint、typecheck、unit/integration、静态导出、公开内容校验和 TypeScript build 退出码均为 0。

## 6. 非目标验证

检查 Git diff，确认：

- 未删除当前 Event、Signal、Source、Actor 或 snapshot 数据；
- 未修改公开导航、页面路由或发布过滤；
- 未启用暂停的定时工作流；
- 未加入新的运行时依赖；
- 未声明 MySQL 兼容。
