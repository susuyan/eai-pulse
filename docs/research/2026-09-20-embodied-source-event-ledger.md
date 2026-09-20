# 具身数据来源与事件证据台账

核验日期：2026-09-20。范围：本次来源地图扩容；事件补齐由后续任务追加。

## 审阅结论与边界

- 保留 35 个既有独立渠道，新增 48 个审阅渠道，共 83 个；中国 46 个（55.4%）。删除的仅是重复目录条目，历史 provenance 由现有软退役流程保留。
- 新来源全部为 `draft`、禁用、人工元数据审阅；48 个新入口均没有通过本仓库的来源专属适配器契约，因此不能称为已接入。现有 35 个渠道保留 `shadow` 生命周期，地图同样为 `pending`；原契约清单只验证目录配置，不能证明生产采集。
- `pending` 表示尚未完成 robots、许可与适配器审阅；`restricted` 记录已观察到的防护或许可边界；SAMR 是 CESI 标准公告的替代入口，不能替代 CESI 自身研究消息。
- 新条目的 endpoint 均是人工阅读入口，不是可自动轮询的 API/feed。首次适配必须单独通过 robots/条款、成功/失败/漂移 fixture、真实窗口等检查。没有执行绕过防护或登录的操作。
- Tier 1 仅表示机构对自身发布内容的原始来源；厂商性能、规模、客户与合规宣传均为声明，不能视为独立核验或自动发布 Event。
- 六段覆盖是基于页面内容的编辑判断，表示值得观察的生产环节，不代表供应商已经具备或通过验收的能力。
- 同组织渠道共用可核验身份域；不把公共托管平台作为项目间独立性依据。GitHub-only 项目在没有已确认自有域时保留空 identityHosts，使用 source owner 与后续 Evidence.sourceIdentity 审查；NVIDIA、ByteDance/PICO、OpenDriveLab/AgiBot、北京中心/RoboMIND 的共同关系显式记录。
- DROID `droid-consortium` 与 `droid-project` 是同一 owner、同一页面，合并至后者；既有证据的 slug、Event、原始 URL、标题、时间不变，只统一来源和 sourceIdentity。
- 以下“核验”仅指本轮通过公开原始页面/官方搜索索引确认身份与相关性，不代表访问 SLO、许可通过或采集健康。既有行从已审阅 launch catalog 继承，未重跑逐源网络验证。

## 六段缩写

| 代码 | 阶段 |
| --- | --- |
| D | `demand-definition` |
| A | `acquisition-route` |
| M | `multimodal-capture` |
| P | `production-operations` |
| E | `data-engineering-standards` |
| Q | `quality-training-feedback` |

## 新来源审阅表

每项默认 cadence=weekly、freshness SLO=168h、adapter version=1、authority=85（编辑初值）、quality=70（未测量初值）；不得展示为实测质量。下列 R1/L1 是各项显式引用的访问政策。

- R1：自动化尚未批准。开始适配前核对站点 robots.txt 和 owner 条款；当前只允许人工核对公开元数据。
- L1：只记录公开元数据及短摘要并保留归属；数据集、代码、模型与标准正文分别核对专属许可，不做整体授权推断。

| slug / owner | canonical URL / endpoint | region / language / role / tier / category | acquisition / coverage | identity hosts | access decision / robots / license | 原始证据与判断 | verifiedAt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `samr-standards` / State Administration for Market Regulation | [官方入口](https://www.samr.gov.cn/bzjss/)；endpoint 同左 | CN / zh-CN / policy / T1 / standard-policy | manual / E, Q | samr.gov.cn, std.samr.gov.cn, openstd.samr.gov.cn | substitute; draft; R1/L1; substituteFor=cesi-embodied-standards | [原始证据](https://std.samr.gov.cn/gb/search/gbDetailed?id=Z07fBwVFuUo%3D&mode=p)：国家标准公告及具身智能真实数据质量规范；以公告元数据代替被防护拦截的 CESI 页面。 | 2026-09-20 |
| `miit-embodied-policy` / Ministry of Industry and Information Technology | [官方入口](https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2026/art_f291ccd3da4c47ce95741de63cc088e6.html)；endpoint 同左 | CN / zh-CN / policy / T1 / standard-policy | manual / D, P, Q | miit.gov.cn | pending; draft; R1/L1 | [原始证据](https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2026/art_f291ccd3da4c47ce95741de63cc088e6.html)：实景实训通知要求积累真机数据并验证部署；仅收录与数据生产有关的政策。 | 2026-09-20 |
| `cesi-embodied-standards` / China Electronics Standardization Institute | [官方入口](https://www.cesi.cn/)；endpoint 同左 | CN / zh-CN / policy / T1 / standard-policy | manual / E, Q | cesi.cn | restricted; draft; R1/L1; Official site returned a JavaScript cloud-protection challenge; do not bypass it. | [原始证据](https://std.samr.gov.cn/gb/search/gbDetailed?id=Z07fBwVFuUo%3D&mode=p)：官网返回云防护页面；SAMR 原始标准记录证实其为具身数据质量规范起草单位。 | 2026-09-20 |
| `beijing-humanoid-center` / Beijing Humanoid Robot Innovation Center | [官方入口](https://x-humanoid.com/about.html)；endpoint 同左 | CN / zh-CN / primary / T1 / robot-team | manual / A, P, Q | x-humanoid.com, x-humanoid-robomind.github.io | pending; draft; R1/L1 | [原始证据](https://x-humanoid.com/about.html)：官网列出具身数据与慧思开物平台；与 RoboMIND 共用机构身份。 | 2026-09-20 |
| `shanghai-humanoid-center` / Humanoid Robot Shanghai | [官方入口](https://www.openloong.net/)；endpoint 同左 | CN / zh-CN / primary / T1 / robot-team | manual / P, E, Q | openloong.net | pending; draft; R1/L1 | [原始证据](https://www.openloong.net/)：官网介绍白虎数据集的生产、处理和存储规范。 | 2026-09-20 |
| `shanghai-embodied-policy` / Shanghai Municipal Government | [官方入口](https://www.shanghai.gov.cn/nw12344/20250806/f9cb53544505426d807055ca20bd69fc.html)；endpoint 同左 | CN / zh-CN / policy / T1 / standard-policy | manual / D, A, P | shanghai.gov.cn | pending; draft; R1/L1 | [原始证据](https://www.shanghai.gov.cn/nw12344/20250806/f9cb53544505426d807055ca20bd69fc.html)：市政府方案明确语料采集、数字孪生实训和真实验证。 | 2026-09-20 |
| `beijing-embodied-policy` / Beijing Municipal Government | [官方入口](https://www.beijing.gov.cn/zhengce/zhengcefagui/202503/t20250304_4024579.html)；endpoint 同左 | CN / zh-CN / policy / T1 / standard-policy | manual / D, A, P | beijing.gov.cn | pending; draft; R1/L1 | [原始证据](https://www.beijing.gov.cn/zhengce/zhengcefagui/202503/t20250304_4024579.html)：市级行动计划明确多模态生成平台与虚实融合数据采集训练场。 | 2026-09-20 |
| `shenzhen-embodied-policy` / Shenzhen Municipal Government | [官方入口](https://stic.sz.gov.cn/gkmlpt/content/12/12052/mpost_12052515.html)；endpoint 同左 | CN / zh-CN / policy / T1 / standard-policy | manual / D, A, P | stic.sz.gov.cn | pending; draft; R1/L1 | [原始证据](https://stic.sz.gov.cn/gkmlpt/content/12/12052/mpost_12052515.html)：行动计划围绕多模态具身模型与训练数据建设。 | 2026-09-20 |
| `guangzhou-embodied-policy` / Guangzhou Municipal Government | [官方入口](https://gxj.gz.gov.cn/yw/zchb/zcwj/cyzc/content/post_10886099.html)；endpoint 同左 | CN / zh-CN / policy / T1 / standard-policy | manual / D, P, E | gxj.gz.gov.cn | pending; draft; R1/L1 | [原始证据](https://gxj.gz.gov.cn/yw/zchb/zcwj/cyzc/content/post_10886099.html)：市工信局措施明确训练场、采集规范与开源数据集。 | 2026-09-20 |
| `galbot` / Galbot | [官方入口](https://www.galbot.com/)；endpoint 同左 | CN / zh-CN / primary / T1 / robot-team | manual / A, Q | galbot.com | pending; draft; R1/L1 | [原始证据](https://www.galbot.com/)：官方页面描述具身模型和跨场景训练数据使用；性能声明仍为厂商声明。 | 2026-09-20 |
| `limx-dynamics` / LimX Dynamics | [官方入口](https://www.limxdynamics.com/zh)；endpoint 同左 | CN / zh-CN / primary / T1 / robot-team | manual / A, Q | limxdynamics.com | pending; draft; R1/L1 | [原始证据](https://www.limxdynamics.com/zh)：官方 FluxVLA、DreamActor 与仿真到真机训练工具。 | 2026-09-20 |
| `noetix-robotics` / Noetix Robotics | [官方入口](https://en.noetixrobotics.com/about.html)；endpoint 同左 | CN / en / primary / T1 / robot-team | manual / A, M | en.noetixrobotics.com | pending; draft; R1/L1 | [原始证据](https://en.noetixrobotics.com/about.html)：官方里程碑记载上肢抓取遥操作与模仿学习。 | 2026-09-20 |
| `engineai` / EngineAI Robotics | [官方入口](https://www.engineai.com.cn/policy)；endpoint 同左 | CN / zh-CN / primary / T1 / robot-team | manual / M, E | engineai.com.cn | pending; draft; R1/L1 | [原始证据](https://www.engineai.com.cn/policy)：官方机器人隐私政策说明图像、视频、语音及本机运行数据处理边界。 | 2026-09-20 |
| `xpeng-robotics` / XPeng | [官方入口](https://www.xiaopeng.com/news/company_news/5511.html)；endpoint 同左 | CN / zh-CN / primary / T1 / robot-team | manual / A, Q | xiaopeng.com, xpeng.com | pending; draft; R1/L1 | [原始证据](https://www.xiaopeng.com/news/company_news/5511.html)：官方 IRON 页面明确训练数据获取与物理世界模型路线。 | 2026-09-20 |
| `tencent-robotics-x` / Tencent | [官方入口](https://tairos.tencent.com/)；endpoint 同左 | CN / zh-CN / primary / T1 / robot-team | manual / A, Q | tencent.com, roboticsx.tencent.com, tairos.tencent.com | pending; draft; R1/L1 | [原始证据](https://tairos.tencent.com/)：Robotics X 官方入口重定向到 Tairos 具身智能开放平台。 | 2026-09-20 |
| `bytedance-seed-robotics` / ByteDance | [官方入口](https://seed.bytedance.com/zh/direction/robotics)；endpoint 同左 | CN / zh-CN / primary / T1 / robot-team | manual / M, Q | bytedance.com, seed.bytedance.com, picoxr.com | pending; draft; R1/L1 | [原始证据](https://byte-dexter.github.io/ByteDexter_Tech_Report_2025.pdf)：官方机器人研究方向与 ByteDexter 技术报告可追溯；PICO 渠道归同一集团。 | 2026-09-20 |
| `internrobotics` / Shanghai AI Laboratory | [官方入口](https://github.com/InternRobotics)；endpoint 同左 | CN / en / research / T1 / robot-team | manual / A, E, Q | shlab.org.cn, pjlab.org.cn, internrobotics.shlab.org.cn | pending; draft; R1/L1 | [原始证据](https://github.com/InternRobotics)：官方组织说明其为上海 AI 实验室具身基础设施项目；组织页不是 Releases feed。 | 2026-09-20 |
| `horizon-holomotion` / Horizon Robotics | [官方入口](https://github.com/HorizonRobotics/HoloMotion)；endpoint 同左 | CN / en / primary / T1 / robot-team | manual / A, M, E, Q | horizon.auto | pending; draft; R1/L1 | [原始证据](https://github.com/HorizonRobotics/HoloMotion)：官方仓库描述动捕、视频动作、遥操作、重定向和共享数据表示。 | 2026-09-20 |
| `tsinghua-air-robotics` / Tsinghua University AIR | [官方入口](https://air.tsinghua.edu.cn/kxyj/znjqr.htm)；endpoint 同左 | CN / zh-CN / research / T1 / robot-team | manual / A, Q | air.tsinghua.edu.cn | pending; draft; R1/L1 | [原始证据](https://air.tsinghua.edu.cn/kxyj/znjqr.htm)：研究院原始页面描述人在环路机器学习与仿真到现实迁移。 | 2026-09-20 |
| `opendrivelab` / OpenDriveLab | [官方入口](https://opendrivelab.com/)；endpoint 同左 | CN / zh-CN / research / T1 / robot-team | manual / A, Q | opendrivelab.com | pending; draft; R1/L1 | [原始证据](https://opendrivelab.com/)：官方项目页包含 AgiBot World、操作基准与动作数据研究。 | 2026-09-20 |
| `deep-robotics` / DEEP Robotics | [官方入口](https://github.com/DeepRoboticsLab/deep-robotics-simulation)；endpoint 同左 | CN / en / primary / T1 / robot-team | manual / A, Q | deeprobotics.cn | pending; draft; R1/L1 | [原始证据](https://github.com/DeepRoboticsLab/deep-robotics-simulation)：官方 MuJoCo 仿真仓库为云深处产品提供模拟训练与 SDK 入口。 | 2026-09-20 |
| `datatang-embodied` / DataTang | [官方入口](https://datatang.com/news/1222)；endpoint 同左 | CN / zh-CN / primary / T2 / data-service | manual / A, M, P, E, Q | datatang.com, datatang.ai, datatang.net | pending; draft; R1/L1 | [原始证据](https://datatang.com/news/1222)：官方页面列出具身采集工厂、动捕、力反馈、多视角 RGB-D 和标注模板。 | 2026-09-20 |
| `pnp-robotics` / PNP Robotics | [官方入口](https://www.pnprobotics.com/)；endpoint 同左 | CN / zh-CN / primary / T2 / data-service | manual / A, M, P | pnprobotics.com | pending; draft; R1/L1 | [原始证据](https://www.pnprobotics.com/)：官网列出遥操作、数据采集及部署成套方案；外部新闻转载不可作其独立原始证据。 | 2026-09-20 |
| `noitom` / Noitom | [官方入口](https://www.noitom.com/)；endpoint 同左 | CN / en / primary / T1 / capture-tool | manual / A, M | noitom.com, noitom.com.cn | pending; draft; R1/L1 | [原始证据](https://www.noitom.com/)：官方产品页列出惯性动捕、手指动作和连续数据采集。 | 2026-09-20 |
| `pico-motion-tracking` / ByteDance | [官方入口](https://www.picoxr.com/global/products/pico-motion-tracker)；endpoint 同左 | CN / en / primary / T1 / capture-tool | manual / M | bytedance.com, seed.bytedance.com, picoxr.com | pending; draft; R1/L1 | [原始证据](https://www.picoxr.com/global/products/pico-motion-tracker)：官方追踪器产品页；只声明动作捕捉相关性，不声明机器人数据交付。 | 2026-09-20 |
| `robotwin` / RoboTwin Project | [官方入口](https://robotwin-platform.github.io/)；endpoint 同左 | CN / en / research / T1 / dataset-benchmark | manual / D, A, Q | robotwin-platform.github.io | pending; draft; R1/L1 | [原始证据](https://robotwin-platform.github.io/)：官方 RoboTwin 2.0 页面描述任务基准、合成数据与策略训练；地域按项目主导团队记录。 | 2026-09-20 |
| `orbbec` / Orbbec | [官方入口](https://www.orbbec.com/)；endpoint 同左 | CN / en / primary / T1 / capture-tool | manual / M | orbbec.com | pending; draft; R1/L1 | [原始证据](https://www.orbbec.com/)：官方 RGB-D 与机器人视觉硬件目录。 | 2026-09-20 |
| `agilex-data-capture` / AgileX Robotics | [官方入口](https://www.agilex.ai/)；endpoint 同左 | CN / zh-CN / primary / T1 / capture-tool | manual / A, M | agilex.ai | pending; draft; R1/L1 | [原始证据](https://new.agilex.ai/raw/upload/20250218/7fca39d59c52abbdc384d16fe137e08d_65185.pdf)：官方便携式具身数据采集方案提供装置及模型推理流程。 | 2026-09-20 |
| `dobot-data-capture` / Dobot Robotics | [官方入口](https://www.dobot-robots.com/products)；endpoint 同左 | CN / en / primary / T1 / capture-tool | manual / A, M, Q | dobot-robots.com | pending; draft; R1/L1 | [原始证据](https://www.dobot-robots.com/products)：官方产品目录列出 X-Trainer 数据采集与训练系统。 | 2026-09-20 |
| `paxini` / PaXini | [官方入口](https://www.paxini.com/cn/)；endpoint 同左 | CN / zh-CN / primary / T1 / capture-tool | manual / A, M, E | paxini.com | pending; draft; R1/L1 | [原始证据](https://www.paxini.com/cn/)：官方全模态数据生态包括触觉、动捕与 OmniSharing DB。 | 2026-09-20 |
| `dexforce` / DexForce | [官方入口](https://www.dexforce.com/)；endpoint 同左 | CN / zh-CN / primary / T1 / robot-team | manual / A, M, Q | dexforce.com | pending; draft; R1/L1 | [原始证据](https://www.dexforce.com/)：官方技术介绍双目同步、仿真合成数据与 Sim2Real。 | 2026-09-20 |
| `leju-training` / Leju Robotics | [官方入口](https://www.lejurobot.com/en)；endpoint 同左 | CN / en / primary / T1 / robot-team | manual / P, Q | lejurobot.com | pending; draft; R1/L1 | [原始证据](https://www.lejurobot.com/en)：官网训练场方案明确科研、数据生态与模型服务。 | 2026-09-20 |
| `linkerbot-data` / Linkerbot | [官方入口](https://www.linkerbot.cn/data/)；endpoint 同左 | CN / zh-CN / primary / T1 / capture-tool | manual / A, M, P, E, Q | linkerbot.cn | pending; draft; R1/L1 | [原始证据](https://www.linkerbot.cn/data/)：官方数据页描述遥操作、多模态同步、数据校验、格式输出和权限管理。 | 2026-09-20 |
| `spirit-ai` / Spirit AI | [官方入口](https://docs.spirit-ai.com/v2.6/sdk/data-format.html)；endpoint 同左 | CN / zh-CN / primary / T1 / robot-team | manual / M, E, Q | docs.spirit-ai.com | pending; draft; R1/L1 | [原始证据](https://docs.spirit-ai.com/v2.6/sdk/data-format.html)：官方 SDK 文档定义动作指令、机器人状态与相机观测数据格式。 | 2026-09-20 |
| `figure-ai` / Figure AI | [官方入口](https://www.figure.ai/helix)；endpoint 同左 | GLOBAL / en / primary / T1 / robot-team | manual / A, Q | figure.ai | pending; draft; R1/L1 | [原始证据](https://www.figure.ai/helix)：官方 Helix 页面为机器人学习与策略评测入口。 | 2026-09-20 |
| `one-x` / 1X Technologies | [官方入口](https://www.1x.tech/ai)；endpoint 同左 | GLOBAL / en / primary / T1 / robot-team | manual / A, Q | 1x.tech | pending; draft; R1/L1 | [原始证据](https://www.1x.tech/ai)：官方 AI 页面介绍世界模型、机器人学习与数据路线。 | 2026-09-20 |
| `apptronik` / Apptronik | [官方入口](https://apptronik.com/company/press-releases)；endpoint 同左 | GLOBAL / en / primary / T1 / robot-team | manual / P, Q | apptronik.com | pending; draft; R1/L1 | [原始证据](https://apptronik.com/company/press-releases)：官方公告说明 Robot Park 和客户现场机器人收集真实数据。 | 2026-09-20 |
| `sanctuary-ai` / Sanctuary AI | [官方入口](https://sanctuary.ai/news/)；endpoint 同左 | GLOBAL / en / primary / T1 / robot-team | manual / M, Q | sanctuary.ai | pending; draft; R1/L1 | [原始证据](https://sanctuary.ai/news/)：官方新闻和工业任务策略评测入口；性能不作为独立验证。 | 2026-09-20 |
| `rai-institute` / Robotics and AI Institute | [官方入口](https://rai-inst.com/)；endpoint 同左 | GLOBAL / en / research / T1 / robot-team | manual / A, Q | rai-inst.com | pending; draft; R1/L1 | [原始证据](https://rai-inst.com/)：原 Boston Dynamics AI Institute 域名重定向到 RAI；官网列出数据驱动交互模型。 | 2026-09-20 |
| `toyota-research-robotics` / Toyota Research Institute | [官方入口](https://www.tri.global/our-work/robotics)；endpoint 同左 | GLOBAL / en / research / T1 / robot-team | manual / A, Q | tri.global | restricted; draft; R1/L1; Official robotics page returned HTTP 403 on recheck; manual review only. | [丰田官方原始公告](https://pressroom.toyota.com/toyota-research-institute-unveils-breakthrough-in-teaching-robots-new-behaviors/)说明触觉示范、语言目标与 Diffusion Policy；TRI 研究入口复查返回 403，保留受限状态。 | 2026-09-20 |
| `nvidia-isaac-groot` / NVIDIA | [官方入口](https://github.com/NVIDIA/Isaac-GR00T)；endpoint 同左 | GLOBAL / en / primary / T1 / robot-team | manual / A, E, Q | nvidia.com, developer.nvidia.com | pending; draft; R1/L1 | [原始证据](https://github.com/NVIDIA/Isaac-GR00T)：官方仓库描述演示数据格式转换、微调和评测；尚未验证采集契约。 | 2026-09-20 |
| `nist-physical-ai` / National Institute of Standards and Technology | [官方入口](https://www.nist.gov/programs-projects/physical-ai-and-data-generation-robotics)；endpoint 同左 | GLOBAL / en / policy / T1 / standard-policy | manual / D, E, Q | nist.gov | pending; draft; R1/L1 | [原始证据](https://www.nist.gov/programs-projects/physical-ai-and-data-generation-robotics)：原始项目页面定义机器人物理 AI 数据生成、指标和测试方法。 | 2026-09-20 |
| `iso-tc299` / International Organization for Standardization | [官方入口](https://www.iso.org/committee/5915511.html)；endpoint 同左 | GLOBAL / en / policy / T1 / standard-policy | manual / D, E, Q | iso.org | restricted; draft; R1/L1; Public committee metadata only; standard texts may require purchase and must not be scraped. | [原始证据](https://www.iso.org/committee/5915511.html)：公开委员会范围与标准目录；完整标准文本可能需付费，禁止采集正文。 | 2026-09-20 |
| `itu-robot-data-factory` / International Telecommunication Union | [官方入口](https://www.itu.int/ITU-T/workprog/wp_item.aspx?isn=24285)；endpoint 同左 | GLOBAL / en / policy / T1 / standard-policy | manual / P, E | itu.int | pending; draft; R1/L1 | [原始证据](https://www.itu.int/ITU-T/workprog/wp_item.aspx?isn=24285)：原始工作项目 Q.RDFS-SRA 描述机器人数据工厂分层架构；状态为研究中，不是已发布标准。 | 2026-09-20 |
| `manus` / MANUS | [官方入口](https://www.manus-meta.com/)；endpoint 同左 | GLOBAL / en / primary / T1 / capture-tool | manual / A, M | manus-meta.com | pending; draft; R1/L1 | [原始证据](https://www.manus-meta.com/)：官方机器人应用页说明手部追踪、数据手套与遥操作。 | 2026-09-20 |
| `xsens` / Xsens Technologies | [官方入口](https://www.xsens.com/)；endpoint 同左 | GLOBAL / en / primary / T1 / capture-tool | manual / A, M | xsens.com, movella.com | pending; draft; R1/L1 | [原始证据](https://www.xsens.com/)：官方动捕与人形机器人训练产品，归并 movella 相关域名。 | 2026-09-20 |
| `senseglove` / SenseGlove | [官方入口](https://www.senseglove.com/)；endpoint 同左 | GLOBAL / en / primary / T1 / capture-tool | manual / A, M | senseglove.com | pending; draft; R1/L1 | [原始证据](https://www.senseglove.com/)：官方 R1 与力反馈手套用于遥操作和模仿学习。 | 2026-09-20 |
| `realsense` / RealSense | [官方入口](https://www.realsenseai.com/)；endpoint 同左 | GLOBAL / en / primary / T1 / capture-tool | manual / M | realsenseai.com, realsense.com | pending; draft; R1/L1 | [原始证据](https://www.realsenseai.com/)：以当前官方 RealSense 品牌和域名为准，避免继续将其简单称作 Intel 部门。 | 2026-09-20 |

## 既有渠道治理补齐

原始资料来自 launch catalog 与 `tests/fixtures/embodied-data/launch/event-source-manifest.json`。本轮只补覆盖、公开地图状态及身份域，保留既有 adapter/endpoint/lifecycle；未把既有“配置匹配测试”重新命名为联网契约验证。R0：遵守 robots 与条款，未经允许停止自动化；L0：公开元数据、短摘要与归属，重用前检查项目许可。各项既有 freshness SLO 与 cadence 保留在目录中。

| slug / owner | canonical URL | endpoint | region / language / role / tier / category | acquisition / coverage | identity hosts | access / robots / license / verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `droid-project` / DROID Dataset Team | [原始入口](https://droid-dataset.github.io/) | [既有 endpoint](https://droid-dataset.github.io/) | GLOBAL / en / research / T1 / dataset-benchmark | html / A, P, Q | droid-dataset.github.io | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `bridge-data-v2` / UC Berkeley RAIL | [原始入口](https://rail-berkeley.github.io/bridgedata/) | [既有 endpoint](https://rail-berkeley.github.io/bridgedata/) | GLOBAL / en / research / T1 / dataset-benchmark | html / A, Q | rail-berkeley.github.io | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `open-x-embodiment` / Open X-Embodiment Collaboration | [原始入口](https://robotics-transformer-x.github.io/) | [既有 endpoint](https://robotics-transformer-x.github.io/) | GLOBAL / en / research / T1 / dataset-benchmark | html / E, Q | robotics-transformer-x.github.io | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `rh20t` / Shanghai Jiao Tong University | [原始入口](https://rh20t.github.io/) | [既有 endpoint](https://rh20t.github.io/) | CN / en / research / T1 / dataset-benchmark | html / M, Q | rh20t.github.io | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `roboset` / RoboSet Project | [原始入口](https://robopen.github.io/roboset/) | [既有 endpoint](https://robopen.github.io/roboset/) | GLOBAL / en / research / T1 / dataset-benchmark | html / A, P, Q | robopen.github.io | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `robomind` / Open X-Humanoid | [原始入口](https://x-humanoid-robomind.github.io/) | [既有 endpoint](https://x-humanoid-robomind.github.io/) | CN / en / research / T1 / dataset-benchmark | html / A, M, Q | x-humanoid.com, x-humanoid-robomind.github.io | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `agibot-world` / OpenDriveLab and AgiBot | [原始入口](https://github.com/OpenDriveLab/AgiBot-World) | [既有 endpoint](https://github.com/OpenDriveLab/AgiBot-World/releases.atom) | CN / en / primary / T1 / robot-team | github / A, P, Q | opendrivelab.com, agibot.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `behavior-1k` / Stanford Vision and Learning Lab | [原始入口](https://github.com/StanfordVL/BEHAVIOR-1K) | [既有 endpoint](https://github.com/StanfordVL/BEHAVIOR-1K/releases.atom) | GLOBAL / en / research / T1 / dataset-benchmark | github / D, A, Q | svl.stanford.edu | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `libero-benchmark` / Lifelong Robot Learning Lab | [原始入口](https://github.com/Lifelong-Robot-Learning/LIBERO) | [既有 endpoint](https://github.com/Lifelong-Robot-Learning/LIBERO/releases.atom) | GLOBAL / en / research / T1 / dataset-benchmark | github / D, Q | 无确认自有域；按 owner 审阅 | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `robocasa` / RoboCasa Project | [原始入口](https://github.com/robocasa/robocasa) | [既有 endpoint](https://github.com/robocasa/robocasa/releases.atom) | GLOBAL / en / research / T1 / dataset-benchmark | github / A, Q | robocasa.ai | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `calvin-benchmark` / CALVIN Project | [原始入口](https://github.com/mees/calvin) | [既有 endpoint](https://github.com/mees/calvin/releases.atom) | GLOBAL / en / research / T1 / dataset-benchmark | github / D, Q | 无确认自有域；按 owner 审阅 | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `holoassist` / Microsoft Research | [原始入口](https://holoassist.github.io/) | [既有 endpoint](https://holoassist.github.io/) | GLOBAL / en / research / T1 / dataset-benchmark | html / M | holoassist.github.io | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `ego-exo4d` / Ego4D Consortium | [原始入口](https://ego-exo4d-data.org/) | [既有 endpoint](https://ego-exo4d-data.org/) | GLOBAL / en / research / T1 / dataset-benchmark | html / A, M | ego-exo4d-data.org | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `ario-dataset` / ARIO Project | [原始入口](https://imaei.github.io/project_pages/ario/) | [既有 endpoint](https://imaei.github.io/project_pages/ario/) | GLOBAL / en / research / T1 / dataset-benchmark | html / E | imaei.github.io | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `huggingface-lerobot` / Hugging Face | [原始入口](https://github.com/huggingface/lerobot) | [既有 endpoint](https://github.com/huggingface/lerobot/releases.atom) | GLOBAL / en / primary / T1 / standard-policy | github / E, Q | huggingface.co | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `google-rlds` / Google Research | [原始入口](https://github.com/google-research/rlds) | [既有 endpoint](https://github.com/google-research/rlds/releases.atom) | GLOBAL / en / primary / T1 / standard-policy | github / E | research.google, deepmind.google | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `ros2-rosbag2` / Open Source Robotics Foundation | [原始入口](https://github.com/ros2/rosbag2) | [既有 endpoint](https://github.com/ros2/rosbag2/releases.atom) | GLOBAL / en / primary / T1 / standard-policy | github / M, E | ros.org | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `foxglove-mcap` / Foxglove | [原始入口](https://github.com/foxglove/mcap) | [既有 endpoint](https://github.com/foxglove/mcap/releases.atom) | GLOBAL / en / primary / T1 / standard-policy | github / E | foxglove.dev | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `universal-manipulation-interface` / Stanford REAL | [原始入口](https://github.com/real-stanford/universal_manipulation_interface) | [既有 endpoint](https://github.com/real-stanford/universal_manipulation_interface/releases.atom) | GLOBAL / en / research / T1 / capture-tool | github / A, M | real.stanford.edu | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `gello` / GELLO Project | [原始入口](https://github.com/wuphilipp/gello_software) | [既有 endpoint](https://github.com/wuphilipp/gello_software/releases.atom) | GLOBAL / en / research / T1 / capture-tool | github / A, M | 无确认自有域；按 owner 审阅 | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `aloha-act` / ALOHA Project | [原始入口](https://github.com/tonyzhaozh/act) | [既有 endpoint](https://github.com/tonyzhaozh/act/releases.atom) | GLOBAL / en / research / T1 / capture-tool | github / A, M, Q | 无确认自有域；按 owner 审阅 | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `nvidia-isaac-sim` / NVIDIA | [原始入口](https://github.com/isaac-sim/IsaacSim) | [既有 endpoint](https://github.com/isaac-sim/IsaacSim/releases.atom) | GLOBAL / en / primary / T1 / capture-tool | github / A, M | nvidia.com, developer.nvidia.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `nvidia-isaac-lab` / NVIDIA | [原始入口](https://github.com/isaac-sim/IsaacLab) | [既有 endpoint](https://github.com/isaac-sim/IsaacLab/releases.atom) | GLOBAL / en / primary / T1 / capture-tool | github / A, Q | nvidia.com, developer.nvidia.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `nvidia-isaac-teleop` / NVIDIA | [原始入口](https://developer.nvidia.com/isaac/sim) | [既有 endpoint](https://developer.nvidia.com/isaac/sim) | GLOBAL / en / primary / T1 / capture-tool | html / A, M | nvidia.com, developer.nvidia.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `google-deepmind-robotics` / Google DeepMind | [原始入口](https://deepmind.google/discover/blog/) | [既有 endpoint](https://deepmind.google/discover/blog/) | GLOBAL / en / primary / T1 / robot-team | html / A, Q | research.google, deepmind.google | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `unitree-robotics` / Unitree Robotics | [原始入口](https://github.com/unitreerobotics/unitree_rl_gym) | [既有 endpoint](https://github.com/unitreerobotics/unitree_rl_gym/releases.atom) | CN / en / primary / T1 / robot-team | github / A, Q | unitree.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `fourier-intelligence` / Fourier Intelligence | [原始入口](https://fourierintelligence.com/) | [既有 endpoint](https://fourierintelligence.com/) | CN / en / primary / T1 / robot-team | html / A, P, Q | fourierintelligence.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `ubtech-robotics` / UBTECH Robotics | [原始入口](https://www.ubtrobot.com/) | [既有 endpoint](https://www.ubtrobot.com/) | CN / en / primary / T1 / robot-team | html / D, P | ubtrobot.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `robotera` / RobotEra | [原始入口](https://www.robotera.com/) | [既有 endpoint](https://www.robotera.com/) | CN / zh-CN / primary / T1 / robot-team | html / A, M | robotera.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `astribot` / Astribot | [原始入口](https://www.astribot.com/) | [既有 endpoint](https://www.astribot.com/) | CN / zh-CN / primary / T1 / robot-team | html / A, M | astribot.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `nexdata-embodied-ai` / Nexdata | [原始入口](https://www.nexdata.ai/industries/embodied-ai) | [既有 endpoint](https://www.nexdata.ai/industries/embodied-ai) | CN / en / primary / T2 / data-service | html / M, P, E, Q | nexdata.ai | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `discover-robotics-data` / DISCOVER Robotics | [原始入口](https://www.discover-robotics.com/en/data-collection) | [既有 endpoint](https://www.discover-robotics.com/en/data-collection) | CN / en / primary / T2 / data-service | html / A, M, P, E, Q | discover-robotics.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `gesen-ai` / Zhejiang Gesen Intelligence Technology | [原始入口](https://www.gesenai.cn/) | [既有 endpoint](https://www.gesenai.cn/) | CN / zh-CN / primary / T2 / data-service | html / P, E, Q | gesenai.cn | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `galaxea-ai` / Galaxea AI | [原始入口](https://www.galaxea-ai.com/) | [既有 endpoint](https://www.galaxea-ai.com/) | CN / en / primary / T1 / peer-evidence | html / A, P, Q | galaxea-ai.com | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |
| `physical-intelligence` / Physical Intelligence | [原始入口](https://www.physicalintelligence.company/blog) | [既有 endpoint](https://www.physicalintelligence.company/blog) | GLOBAL / en / primary / T1 / peer-evidence | html / A, Q | physicalintelligence.company | pending / shadow / R0 / L0 / 2026-09-20 目录审阅；网络核验继承 launch 台账 |

## 候选池未纳入项

候选池不是预先批准名单；以下决定日期均为 2026-09-20。“暂缓”不代表无效或否定企业能力，只表示本轮没有建立足够具体的目录记录。后续研究仍需逐项过门禁，不能直接晋级。

| 候选 | 原始入口 / 本轮观察 | 决定与原因 |
| --- | --- | --- |
| Kepler Exploration Robot | [官网](https://www.gotokepler.com/) 仅返回 JavaScript 应用提示 | 暂缓；缺少本轮可读取的采集、训练数据或工具证据，未用第三方宣传补齐。 |
| DroidUp | [官网](https://www.droidup.com/) 可读，描述本体及应用场景 | 暂缓；本轮页面没有明确的数据生产流程或数据集证据，通用机器人宣传不足以收录。 |
| Magic Data robotics | [官方简介](https://www.magicdatatech.com/index.php/about-us/) 重点为语音与对话数据 | 不纳入当前具身目录；尚未核实机器人动作数据、采集管线或对应产品。 |
| Alibaba DAMO robotics | [官方组织](https://github.com/alibaba-damo-academy) 可定位 RynnBot / Rynn 相关项目 | 暂缓；组织主页不等于经审阅的机器人数据接口，本轮优先已明确数据格式的中国来源。 |
| Baidu robotics | [官方地图方案](https://lbs.baidu.com/solutions/embodiedai) 描述数据采编与导航 | 暂缓；候选“Baidu robotics”范围过宽，应下一轮明确地图采编或百舸训练基础设施的具体渠道，不能把社区文章当官方发布。 |
| Tesla AI robotics | [官方 AI 页面](https://www.tesla.com/AI) 可读 | 暂缓；本轮优先数据质量/标准/捕捉工具的全球覆盖，未建立 Optimus 专属数据证据入口。 |
| Meta FAIR robotics | [官方 Habitat 研究](https://ai.meta.com/blog/habitat-3-socially-intelligent-robots-siro/) 可核实 | 暂缓新增机构渠道；现有 Ego-Exo4D 已覆盖其合作数据体系，应先核对合作机构独立性和具体项目范围。 |
| Skild AI | [官网](https://www.skild.ai/) 可读 | 暂缓；本轮未完成具体数据生产证据与采集入口审阅，不能凭通用机器人智能主张补录。 |
| Dexterity | [官网](https://dexterity.ai/) 可读 | 暂缓；本轮未完成其真实生产数据闭环的独立范围审阅。 |
| Covariant | [官网](https://covariant.ai/) 仅返回有限文本 | 暂缓；可读内容不足以重新确认当前 owner/channel 与数据接口。 |
| Generalist AI | [官网](https://generalistai.com/) 可定位官方主体 | 暂缓；本轮未进一步核对数据采集工作流、端点和许可；不依据潜在价值直接收录。 |
| EgoNet | [官方项目](https://www.egonet.ai/) 描述第一视角多模态数据 | 暂缓新增；需补齐确切机构 owner、数据许可与合作渠道身份；不能与同名社交网络软件混淆。 |
| RoboCasa365 | [官方 RoboCasa 页面](https://robocasa.ai/) 记载 2026-02-18 v1.0 | 不新建重复来源；这是已收录 `robocasa` 项目的版本，可在后续事件补齐中引用。 |
| RoboDATA.AI | [正确官方入口](https://www.therobodata.ai/)；`robodata.ai` 本轮不可读，其他同名采购/数据平台不相关 | 暂缓；官网自述 pre-seed/stealth，主体与数据权利链未完成核验。 |
| TRACE Dynamics | [正确官方入口](https://www.tracedynamics.ai/) 描述 WELL；`tracedynamics.com` 是另一网站 | 暂缓；真实采集与授权为自述，尚未确认 owner 主体与访问政策，不与 Trace Labs 混为一家。 |
| Khenda Robotics | [机器人业务官网](https://khendarobotics.com/) 描述工厂采集与数据交付；`khenda.com` 为连续改进产品 | 暂缓；已找到相关原始页面，仍需核对同主体关系与数据授权，不把营销合规标签当认证事实。 |

## 访问与身份后续门禁

- 本轮没有下载数据集、标准正文、模型权重或第三方完整文章，没有保存原始 collector payload。
- 每个新来源只有 map 记录；没有健康成功记录、cursor、自动运行窗口或 active 晋级。
- 新记录采用 owner 和 identityHosts 提供归并依据；跨合作机构/媒体集团的独立性仍须在 Event Evidence 中核对，域名数组本身不是完整独立性算法。
- 本轮没有新增公开 Event。后续事件补齐应直接引用原始页面，单独检查发布时间、证据阈值与内容范围，尤其不要把 ITU 研究项目写成已生效标准。
