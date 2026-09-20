# TEST：具身数据领域对象

## 1. Schema

新增 `tests/embodied-data-objects-domain.test.ts`：

- 三类真实对象 fixture 全部通过严格 Schema。
- 能力声明和聚合 PeerCompanyProfile 通过。
- HTTP URL、带 userinfo 或查询参数的 URL、额外字段、未知类型、无来源数字声明失败。
- formal、de-facto 和 project-format 可区分。

## 2. 数据库与 Repository

新增 `tests/embodied-data-objects-schema.test.ts`：

- 八张表和唯一约束存在。
- 对象与 Event 关系可写入并幂等。
- Event 删除只删除关系。
- 对象、Actor 删除按约束级联。
- Repository 写入与读取执行双向 Schema 校验。
- Repository upsert 在并发写入下保持原子与幂等，未知 schema version 读取失败。
- Actor 收录、能力自报、独立验证和冲突状态保持分离。

## 3. 快照

扩展 `tests/snapshot.test.ts`：

- 四类对象和全部关系完成新数据库往返。
- 快照使用 slug、Actor slug 和 capability key 解析关系。
- 缺失引用、未知版本和非法时间戳触发完整回滚，既有对象 ID 与 `created_at` 保持不变。
- Event 合并保留对象关系、能力证据、DataProfile 和 Scout evidence；冲突 Profile 阻断合并。
- 旧快照缺少新增数组时恢复后对象表为空。
- 无原始 payload、本机路径或私有字段泄漏。

## 4. Fixture 证据

新增 `tests/fixtures/embodied-data/objects/source-manifest.json`，记录对象、来源 URL、来源类型和核验日期。实施时人工访问官方来源或原始论文，并在 TASKS 记录核验结果。自动测试只验证结构和 HTTPS，不发起不稳定网络请求。

## 5. 全量回归

```bash
npm test -- --run tests/embodied-data-objects-domain.test.ts tests/embodied-data-objects-schema.test.ts tests/snapshot.test.ts
npm run check
npm run build
```

检查 Git diff，确认未修改 `data/snapshot/v1.json`、seed、公开 DTO、路由、导航和发布过滤。
