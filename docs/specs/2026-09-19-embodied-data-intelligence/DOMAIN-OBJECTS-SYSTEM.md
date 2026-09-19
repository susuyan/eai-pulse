# SYSTEM：具身数据领域对象

## 1. 事实边界

- Event 保存发生过的事实和时间性判断。
- Dataset、Standard 和 CollectionMethod 保存可跨 Event 复用的稳定描述。
- Actor 表示已收录主体；ActorDataCapability 表示一条带来源的能力声明。
- 领域对象不能复制 Evidence 正文，不能绕过 Event readiness，不能直接进入公开站。

## 2. Schema

新增 `src/domain/embodied-data-objects.ts`，导出：

- `DatasetProfileSchema`
- `StandardProfileSchema`
- `CollectionMethodProfileSchema`
- `ActorDataCapabilitySchema`
- `PeerCompanyProfileSchema`

共用 `EvidenceStatusSchema`、管线阶段、本体、任务、模态和采集方式枚举。所有来源 URL 必须为 HTTPS。所有带数值的规模、吞吐和成本声明必须包含 `metric`、`value`、`unit` 和 `sourceUrl`。

## 3. 持久化

新增迁移 `013_embodied_data_objects`：

```text
datasets
dataset_events
standards
standard_events
collection_methods
collection_method_events
actor_data_capabilities
actor_capability_evidence
```

Dataset、Standard 和 CollectionMethod 主表统一包含：

```text
id, slug, profile_json, schema_version, created_at, updated_at
```

对象 slug 唯一。关系表使用复合主键，关系角色使用受控枚举。删除 Event 只级联删除关系；删除对象级联删除关系。

ActorDataCapability 包含 `id`、`actor_id`、`capability_key`、严格 JSON、版本与时间；`actor_id + capability_key` 唯一。ActorCapabilityEvidence 使用 `capability_id + event_id + evidence_role` 复合主键。

## 4. Repository 契约

Repository 新增：

```ts
upsertDataset(slug, profile)
getDatasetBySlug(slug)
listDatasets()
linkDatasetEvent(datasetId, eventId, relationRole)

upsertStandard(slug, profile)
getStandardBySlug(slug)
listStandards()
linkStandardEvent(standardId, eventId, relationRole)

upsertCollectionMethod(slug, profile)
getCollectionMethodBySlug(slug)
listCollectionMethods()
linkCollectionMethodEvent(methodId, eventId, relationRole)

upsertActorDataCapability(actorId, capability)
listActorDataCapabilities(actorId)
linkActorCapabilityEvidence(capabilityId, eventId, evidenceRole)
getPeerCompanyProfile(actorId)
```

所有写入在数据库操作前执行 Schema 校验；所有读取在返回前再次校验。Upsert 保留 `created_at`，更新 `updated_at`。

## 5. 快照

保持 `SNAPSHOT_SCHEMA_VERSION = 1`，新增可选数组：

- `datasets`
- `datasetEvents`
- `standards`
- `standardEvents`
- `collectionMethods`
- `collectionMethodEvents`
- `actorDataCapabilities`
- `actorCapabilityEvidence`

恢复顺序为主对象、能力声明、Event 关系、能力证据。每个 JSON profile 在写出和恢复时都必须通过对应 Schema。关系使用 slug 或稳定 capability key 解析，不依赖不同数据库中的随机 ID。

## 6. Fixture

真实 fixture 保存在 `tests/fixtures/embodied-data/objects/`，不会进入 seed。每条 fixture 包含 `verifiedAt` 和公开原始来源；只记录来源明确支持的字段。

建议基线：

- Dataset：DROID、Open X-Embodiment、BridgeData V2。
- Standard：RLDS、LeRobot dataset format、ROS 2 rosbag2。
- CollectionMethod：遥操作、仿真/合成、自主采集。

最终名称、URL 和字段以实施时的官方来源核验结果为准。

## 7. 失败与回滚

- Schema 失败：事务开始前拒绝写入。
- 关系目标不存在：依赖外键失败，不创建部分关系。
- 快照 profile 失败：整个恢复事务回滚。
- 回滚：按证据关系、能力声明、对象关系、对象表的反向顺序删除。
- 不修改迁移 `012`，不手工编辑快照。
