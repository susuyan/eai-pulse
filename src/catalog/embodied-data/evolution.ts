import type {
  EmbodiedTrend,
  EvolutionPhase,
  PhaseStageImpact,
} from "../../domain/embodied-narrative.js";

const impact = (
  summary: string,
  eventSlugs: string[],
  evidenceState: "supported" | "limited" = "supported",
): PhaseStageImpact => ({ summary, eventSlugs, evidenceState });

const absent = (summary: string): PhaseStageImpact => ({
  summary,
  eventSlugs: [],
  evidenceState: "no-public-evidence",
});

export const evolutionPhases: EvolutionPhase[] = [
  {
    slug: "task-and-data-contracts",
    start: "2022-01-31",
    end: "2022-12-31",
    title: "任务定义与数据契约奠基",
    thesis:
      "仿真工作流、轨迹结构与长程任务基准共同提供数据生产的基础接口，多任务策略研究开始连接任务语义与训练数据。",
    turningPoint:
      "从传感器记录和轨迹存储，到 CALVIN 的连续任务评测与 RT-1 的多任务研究，数据价值开始由任务边界解释。",
    eventSlugs: [
      "isaac-sim-synthetic-sensor-data",
      "mcap-interoperable-sensor-container",
      "rlds-episodic-data-contract",
      "rosbag2-recording-storage-plugins",
      "calvin-long-horizon-language-benchmark",
      "rt1-data-driven-robotics",
    ],
    stageImpacts: {
      "demand-definition": impact(
        "CALVIN 的长程语言任务与 RT-1 的多任务研究，为任务语义和连续完成条件提供了可讨论的共同边界。",
        ["calvin-long-horizon-language-benchmark", "rt1-data-driven-robotics"],
      ),
      "acquisition-route": impact(
        "Isaac Sim 公开传感器仿真与合成工作流，可作为补充数据的候选路线，真实噪声与迁移效果仍需检验。",
        ["isaac-sim-synthetic-sensor-data"],
        "limited",
      ),
      "multimodal-capture": absent(
        "本阶段已收录事件未给出真实多模态采集设备的同步与标定验证，不能据存储工具推定采集能力。",
      ),
      "production-operations": absent(
        "本阶段缺少已发布的现场采集运营事件，尚不能据研究与格式工具判断产能、返工或长期运行表现。",
      ),
      "data-engineering-standards": impact(
        "RLDS、rosbag2 与 MCAP 分别提供轨迹结构、记录回放和日志容器，使数据边界可以用明确接口表达。",
        [
          "rlds-episodic-data-contract",
          "rosbag2-recording-storage-plugins",
          "mcap-interoperable-sensor-container",
        ],
      ),
      "quality-training-feedback": impact(
        "Isaac Sim 的传感器模拟与 CALVIN 的连续评测提供验证入口，但仿真表现不能直接代表真实交付质量。",
        ["isaac-sim-synthetic-sensor-data", "calvin-long-horizon-language-benchmark"],
        "limited",
      ),
    },
    counterEventSlugs: [],
    nextSignals: [
      "观察任务语义、终止条件与日志字段能否在新设备和真实场景中保持一致，并建立可复算的回放检查。",
    ],
  },
  {
    slug: "reusable-demonstrations",
    start: "2023-01-01",
    end: "2023-10-13",
    title: "可复用示范与共享数据约定",
    thesis:
      "开放遥操作装置、跨环境示范和力觉数据拓宽采集选择，任务套件与共享数据约定开始约束复用方式。",
    turningPoint:
      "ALOHA、BridgeData V2 和 RH20T 展示不同示范入口，Open X-Embodiment 将跨机器人数据标准化推向共同训练研究。",
    eventSlugs: [
      "aloha-bimanual-teleoperation",
      "libero-lifelong-task-suites",
      "rh20t-force-aware-capture",
      "bridgedata-v2-reusable-demonstrations",
      "roboset-reproducible-production-baseline",
      "gello-policy-feedback-capture",
      "holoassist-multimodal-human-demonstration",
      "open-x-standardized-datasets",
    ],
    stageImpacts: {
      "demand-definition": impact(
        "LIBERO 将任务套件、数据与评测代码放在同一边界内，使任务分组和持续学习的评测条件可以一并审阅。",
        ["libero-lifelong-task-suites"],
      ),
      "acquisition-route": impact(
        "BridgeData V2 的跨环境示范与 ALOHA、GELLO 的开放遥操作实现，支持按目标任务比较不同采集入口。",
        [
          "bridgedata-v2-reusable-demonstrations",
          "aloha-bimanual-teleoperation",
          "gello-policy-feedback-capture",
        ],
      ),
      "multimodal-capture": impact(
        "RH20T 的视觉、状态与力觉数据，以及 HoloAssist 的第一视角和交互信息，提示采集验收需要区分模态与对齐条件。",
        ["rh20t-force-aware-capture", "holoassist-multimodal-human-demonstration"],
      ),
      "production-operations": impact(
        "RoboSet 公开示范、任务配置与训练基线，可用于检查版本和任务划分的一致性，尚不代表现场运营成本已被验证。",
        ["roboset-reproducible-production-baseline"],
        "limited",
      ),
      "data-engineering-standards": impact(
        "Open X-Embodiment 公开标准化数据集合与跨本体训练研究，但统一格式之后仍需审查动作与观测的语义差异。",
        ["open-x-standardized-datasets"],
      ),
      "quality-training-feedback": impact(
        "LIBERO 的评测接口和 GELLO 的示范实现可以支撑返采与复现试验，设备一致性及真实收益仍需项目侧验证。",
        ["libero-lifelong-task-suites", "gello-policy-feedback-capture"],
        "limited",
      ),
    },
    counterEventSlugs: [],
    nextSignals: [
      "观察跨环境示范与标准化集合在外部硬件上的复现，单独检查动作语义、传感同步和任务划分是否兼容。",
    ],
  },
  {
    slug: "synchronized-distributed-capture",
    start: "2023-10-14",
    end: "2024-03-19",
    title: "同步示范走向分布式采集",
    thesis:
      "内外视角同步、便携人类示范和跨地点采集提供不同扩展路径，设备复现与现场流程成为理解数据差异的必要上下文。",
    turningPoint:
      "Ego-Exo4D 与 UMI 扩展人类示范入口，DROID 同时公开跨地点数据和采集指南，使场景覆盖与运营一致性能够共同讨论。",
    eventSlugs: [
      "ego-exo4d-synchronized-demonstrations",
      "fourier-humanoid-training-platform",
      "umi-portable-demonstration-capture",
      "behavior-1k-task-definition",
      "droid-distributed-collection",
      "droid-consortium-site-operations",
    ],
    stageImpacts: {
      "demand-definition": impact(
        "BEHAVIOR-1K 公开家庭活动任务定义与评测环境，为先明确任务、对象和终止条件再组织示范提供参考。",
        ["behavior-1k-task-definition"],
      ),
      "acquisition-route": impact(
        "DROID 提供跨地点真实环境采集方法，UMI 提供便携示范与部署方法；两条路线需要分别审查硬件基线和动作映射。",
        ["droid-distributed-collection", "umi-portable-demonstration-capture"],
      ),
      "multimodal-capture": impact(
        "Ego-Exo4D 的内外视角同步与 UMI 的便携采集装置拓展观测方式，人类技能到机器人动作的迁移仍需单独验收。",
        ["ego-exo4d-synchronized-demonstrations", "umi-portable-demonstration-capture"],
      ),
      "production-operations": impact(
        "DROID 公开统一硬件与现场操作指南，傅利叶公开训练生态路线；前者提供复现流程，后者仍需核对接口与持续运行证据。",
        ["droid-consortium-site-operations", "fourier-humanoid-training-platform"],
        "limited",
      ),
      "data-engineering-standards": absent(
        "本阶段已收录事件未提供新的共享格式或标准事实，不将同步采集和平台路线自动解释为数据互操作已经完成。",
      ),
      "quality-training-feedback": impact(
        "BEHAVIOR-1K 的评测环境可用来约束任务完成条件，但当前引用不足以确认真实现场的持续训练反馈效果。",
        ["behavior-1k-task-definition"],
        "limited",
      ),
    },
    counterEventSlugs: [],
    nextSignals: [
      "观察跨站点质量差异、校准记录和便携装置的动作映射误差，以真实任务复现判断场景扩展是否增加有效数据。",
    ],
  },
  {
    slug: "open-production-toolchains",
    start: "2024-03-20",
    end: "2024-12-31",
    title: "开放工具链连接场景与生产平台",
    thesis:
      "开放数据工具、仿真环境和多本体平台并行推进，工业任务与服务交付的公开路线使数据工程需要同时面对训练接口与现场边界。",
    turningPoint:
      "LeRobot、Isaac Lab 与 RoboCasa 给出可使用的工具入口，RoboMIND 将多本体示范与统一平台连接，平台之间的兼容问题更加具体。",
    eventSlugs: [
      "isaac-lab-training-evaluation-loop",
      "astribot-manipulation-capture-stack",
      "lerobot-open-dataset-toolchain",
      "robocasa-synthetic-household-data",
      "ubtech-industrial-task-program",
      "unitree-simulation-training-loop",
      "robotera-teleoperation-operations",
      "pi0-data-mixture-policy",
      "nexdata-embodied-delivery-scope",
      "robomind-unified-teleoperation",
    ],
    stageImpacts: {
      "demand-definition": impact(
        "优必选的工业场景路线与 Nexdata 的服务范围，使任务清单、模态要求和验收口径成为采购前可明确的问题。",
        ["ubtech-industrial-task-program", "nexdata-embodied-delivery-scope"],
        "limited",
      ),
      "acquisition-route": impact(
        "RoboMIND 公开多本体遥操作平台，π0 公开跨平台数据混合研究；可据此比较采集协议，但不能预设所有本体可直接复用。",
        ["robomind-unified-teleoperation", "pi0-data-mixture-policy"],
      ),
      "multimodal-capture": impact(
        "星尘智能公开精细操作和采集相关演示，为本体与动作表示协同提供观察入口，连续接触任务仍需独立复现。",
        ["astribot-manipulation-capture-stack"],
        "limited",
      ),
      "production-operations": impact(
        "宇树的仿真部署示例与星动纪元的遥操作训练路线连接生产和模型入口，但停机、返工和持续产出尚不能由产品路线确认。",
        ["unitree-simulation-training-loop", "robotera-teleoperation-operations"],
        "limited",
      ),
      "data-engineering-standards": impact(
        "LeRobot 公开数据集接口和训练工具，使格式转换与基线复现拥有共同入口，版本迁移和硬件兼容仍需逐项测试。",
        ["lerobot-open-dataset-toolchain"],
      ),
      "quality-training-feedback": impact(
        "Isaac Lab 的训练评测环境与 RoboCasa 的程序化场景生成提供闭环试验条件，合成覆盖需要与真实保留任务对照。",
        ["isaac-lab-training-evaluation-loop", "robocasa-synthetic-household-data"],
      ),
    },
    counterEventSlugs: [],
    nextSignals: [
      "观察开放工具链的数据迁移与外部复现，同时要求工业和服务平台给出可追溯的质量、许可与持续运行证据。",
    ],
  },
  {
    slug: "production-and-generalization-loops",
    start: "2025-01-01",
    end: "2025-06-22",
    title: "生产交付与泛化试验开始合流",
    thesis:
      "数据生产资产、统一表示与异构联合训练并列出现，合成路线的发布进一步要求团队把数据覆盖、真实迁移和交付验收分开记录。",
    turningPoint:
      "AgiBot World 公开数据与工具，π0.5 介绍异构联合训练；GR00T-Dreams 和 RoboTwin 2.0 将合成路线与评测问题带到同一观察窗口。",
    eventSlugs: [
      "galaxea-open-data-feedback-loop",
      "discover-managed-collection-route",
      "gesen-data-cleaning-operations",
      "agibot-world-bimanual-corpus",
      "isaac-teleop-simulation-capture",
      "ario-unified-robot-data-representation",
      "pi05-open-world-generalization",
      "nvidia-groot-dreams-synthetic-data",
      "robotwin-2",
    ],
    stageImpacts: {
      "demand-definition": impact(
        "RoboTwin 2.0 将任务程序生成和统一评测联动，提示需求侧应先明确任务成功条件，并隔离训练与验收场景。",
        ["robotwin-2"],
        "limited",
      ),
      "acquisition-route": impact(
        "AgiBot World 的数据资产与 π0.5 的联合训练说明数据组织方式值得比较，GR00T-Dreams 的公告尚不能证明合成路线已达到交付质量。",
        [
          "agibot-world-bimanual-corpus",
          "pi05-open-world-generalization",
          "nvidia-groot-dreams-synthetic-data",
        ],
        "limited",
      ),
      "multimodal-capture": absent(
        "本阶段收录重点是数据资产、服务和训练路线，缺少可单独支撑真实多模态设备同步精度结论的公开事件。",
      ),
      "production-operations": impact(
        "DISCOVER 与格森的服务路径包含采集、管理或清洗支持，采购侧仍需索取可审计的返工、质量和数据权属记录。",
        ["discover-managed-collection-route", "gesen-data-cleaning-operations"],
        "limited",
      ),
      "data-engineering-standards": impact(
        "ARIO 公开统一表示、处理与训练接口，使多来源数据转换有具体审阅对象，但仍需保留原始本体差异与转换记录。",
        ["ario-unified-robot-data-representation"],
      ),
      "quality-training-feedback": impact(
        "π0.5 与 RoboTwin 2.0 提供团队实验陈述，Isaac TeleOp 和星海图提供工作流入口；这些证据尚不等于外部复测通过。",
        [
          "pi05-open-world-generalization",
          "robotwin-2",
          "isaac-teleop-simulation-capture",
          "galaxea-open-data-feedback-loop",
        ],
        "limited",
      ),
    },
    counterEventSlugs: [],
    nextSignals: [
      "观察合成轨迹与真实示范的数据配比、独立留出任务结果和实际开放范围，避免将发布公告或作者实验当成交付验收。",
    ],
  },
  {
    slug: "data-systems-and-factory-interfaces",
    start: "2025-06-23",
    end: "2026-09-20",
    title: "数据系统扩展到重定向与工厂接口",
    thesis:
      "合成预训练、共享动作表示与机器人数据工厂的标准研究共同扩展系统边界；本阶段最后一条证据停在八月联络函，后续进展仍待观察。",
    turningPoint:
      "InternData-A1 提出可组合仿真路线，HoloMotion 连接动作表示与重定向，ITU 的联络函与草案元数据使工厂接口成为可追踪的研究议题。",
    eventSlugs: ["intern-data-a1", "holomotion-retargeting", "itu-robot-data-factory"],
    stageImpacts: {
      "demand-definition": absent(
        "本阶段新增事件未建立独立的真实场景需求与验收定义，不能把合成规模或标准研究直接解释为客户需求已被满足。",
      ),
      "acquisition-route": impact(
        "InternData-A1 论文描述可组合仿真数据生成和预训练，规模与迁移效果属于作者报告，实际交付价值仍需真实任务复现。",
        ["intern-data-a1"],
        "limited",
      ),
      "multimodal-capture": impact(
        "HoloMotion 的多源人体动作接入提供重定向入口，设备同步、坐标系与接触约束仍是需要单独检验的条件。",
        ["holomotion-retargeting"],
        "limited",
      ),
      "production-operations": impact(
        "ITU 公开元数据确认机器人数据工厂的新工作项目与草案记录，仅支持跟踪架构议题，不能据此确认工厂产能或标准合规。",
        ["itu-robot-data-factory"],
        "limited",
      ),
      "data-engineering-standards": impact(
        "HoloSMPL 提供共享动作表示，ITU 记录信令要求与架构研究；两者的性质与成熟度不同，不能合并表述为已生效标准。",
        ["holomotion-retargeting", "itu-robot-data-factory"],
        "limited",
      ),
      "quality-training-feedback": impact(
        "InternData-A1 的迁移比较与 HoloMotion 的重定向方法给出验证方向，当前引用不足以确认独立质量收益或跨本体普适性。",
        ["intern-data-a1", "holomotion-retargeting"],
        "limited",
      ),
    },
    counterEventSlugs: ["droid-consortium-site-operations"],
    nextSignals: [
      "对照 DROID 的现场操作指南检查校准与站点一致性，架构研究和动作表示不能替代实际运营流程与产出验证。",
      "继续观察九月截止日前后的新证据、ITU 可公开草案与审批状态，并区分作者报告、公开方法和独立复测结论。",
    ],
  },
];

export const embodiedTrends: EmbodiedTrend[] = [
  {
    slug: "teleoperation-and-human-demonstrations",
    title: "遥操作与人类示范成为可比较的采集路线",
    thesis:
      "ALOHA、GELLO、UMI 与 DROID 提供不同示范入口，路线选择应由任务覆盖、动作映射与设备维护条件共同决定。",
    whyNow:
      "开放装置与跨地点采集指南已提供具体复现入口，使团队可以围绕代表任务比较采集方式，而非只比较演示效果。",
    pipelineStages: ["acquisition-route", "multimodal-capture", "production-operations"],
    eventSlugs: [
      "aloha-bimanual-teleoperation",
      "gello-policy-feedback-capture",
      "umi-portable-demonstration-capture",
      "droid-distributed-collection",
    ],
    counterEventSlugs: [],
    nextWatch: [
      "观察操作者差异、动作映射失败和长期校准记录；现有引用不能直接给出各路线的可比单位成本或跨设备复用率。",
    ],
  },
  {
    slug: "multimodal-contact-and-synchronization",
    title: "多模态与力觉采集把同步问题推到前台",
    thesis:
      "RH20T 的力觉、HoloAssist 的交互信息与 Ego-Exo4D 的内外视角提示，增加模态应同时明确时间对齐和任务贡献。",
    whyNow:
      "从多视角示范到 HoloMotion 的动作接入，公开方法已覆盖不同观测与表示层，质量审查需要追踪每一次同步和映射。",
    pipelineStages: [
      "multimodal-capture",
      "data-engineering-standards",
      "quality-training-feedback",
    ],
    eventSlugs: [
      "rh20t-force-aware-capture",
      "holoassist-multimodal-human-demonstration",
      "ego-exo4d-synchronized-demonstrations",
      "holomotion-retargeting",
    ],
    counterEventSlugs: [],
    nextWatch: [
      "观察同步误差、力觉零点漂移和缺失模态处理对真实接触任务的影响，以同一任务集评估新增传感器的贡献。",
      "独立触觉采集与触觉训练收益仍缺少本目录中的专门事件，需等待对应公开证据，不能将力觉信息等同于完整触觉能力。",
    ],
  },
  {
    slug: "simulation-and-synthetic-data",
    title: "合成数据路线需要真实任务对照",
    thesis:
      "Isaac Sim、RoboCasa、GR00T-Dreams、RoboTwin 与 InternData-A1 展示不同生成路径，生成规模本身不能回答真实策略是否受益。",
    whyNow:
      "任务程序、域随机化和可组合预训练让生成条件更具体，同时需要区分开放工具、厂商公告与作者实验的证据边界。",
    pipelineStages: ["demand-definition", "acquisition-route", "quality-training-feedback"],
    eventSlugs: [
      "isaac-sim-synthetic-sensor-data",
      "robocasa-synthetic-household-data",
      "nvidia-groot-dreams-synthetic-data",
      "robotwin-2",
      "intern-data-a1",
    ],
    counterEventSlugs: [],
    nextWatch: [
      "观察真实留出任务、生成配置版本与动作有效性过滤，并核对工具实际开放范围；当前作者与厂商收益尚不能视为独立复测。",
    ],
  },
  {
    slug: "cross-embodiment-reuse",
    title: "跨本体复用依赖表示与动作约束",
    thesis:
      "Open X-Embodiment、RoboMIND、π0 与 HoloMotion 分别提供数据集合、平台、混合训练和动作映射入口，复用仍须面对本体差异。",
    whyNow:
      "共享格式与重定向方法使兼容性检查有了具体对象，团队可以从字段语义、动作空间和接触约束逐层定位迁移损失。",
    pipelineStages: [
      "acquisition-route",
      "multimodal-capture",
      "data-engineering-standards",
      "quality-training-feedback",
    ],
    eventSlugs: [
      "open-x-standardized-datasets",
      "robomind-unified-teleoperation",
      "pi0-data-mixture-policy",
      "holomotion-retargeting",
    ],
    counterEventSlugs: [],
    nextWatch: [
      "观察外部本体上的独立复现、动作单位与坐标系转换损失；现有共享接口和研究声明不能证明任意本体都可直接接入。",
    ],
  },
  {
    slug: "traceable-production-operations",
    title: "采集运营需要可追溯的版本与现场流程",
    thesis:
      "RoboSet 的基线、DROID 的站点指南与数据服务商的交付范围表明，采集项目应把任务配置、设备条件与处理记录放在同一审查链上。",
    whyNow:
      "分布式组织和托管服务提供了更多生产入口，采购与运营因此需要核对数据权属、原始层访问和质量报告是否可复算。",
    pipelineStages: [
      "production-operations",
      "data-engineering-standards",
      "quality-training-feedback",
    ],
    eventSlugs: [
      "roboset-reproducible-production-baseline",
      "droid-consortium-site-operations",
      "discover-managed-collection-route",
      "gesen-data-cleaning-operations",
    ],
    counterEventSlugs: [],
    nextWatch: [
      "观察站点差异、停机、返工和退出迁移记录；服务范围与公开指南不足以独立证实持续产能、成本或客户训练收益。",
    ],
  },
  {
    slug: "data-formats-and-standards",
    title: "数据互操作从日志容器延伸到训练表示",
    thesis:
      "MCAP、RLDS、LeRobot 与 ARIO 分别解决容器、轨迹结构和训练接入问题，互操作需要明确每层语义与版本的责任边界。",
    whyNow:
      "已有公开接口可支撑转换试验，ITU 的工厂工作项目又提出架构研究议题，但研究项目与可用格式不能混作同一成熟度。",
    pipelineStages: ["data-engineering-standards", "production-operations"],
    eventSlugs: [
      "mcap-interoperable-sensor-container",
      "rlds-episodic-data-contract",
      "lerobot-open-dataset-toolchain",
      "ario-unified-robot-data-representation",
      "itu-robot-data-factory",
    ],
    counterEventSlugs: [],
    nextWatch: [
      "观察转换损失、历史数据回放和版本升级兼容性；ITU 当前仅有项目与草案元数据证据，不能据此承诺满足正式标准。",
    ],
  },
  {
    slug: "quality-and-training-feedback",
    title: "训练反馈应返回任务与数据需求",
    thesis:
      "CALVIN、LIBERO、Isaac Lab 与 RoboTwin 提供不同评测边界，π0.5 的联合训练研究进一步要求分清数据组合和新场景验证。",
    whyNow:
      "公开任务与训练接口使失败回流具备试验条件，数据团队可以把新增采集与固定留出任务的变化对应起来。",
    pipelineStages: ["demand-definition", "acquisition-route", "quality-training-feedback"],
    eventSlugs: [
      "calvin-long-horizon-language-benchmark",
      "libero-lifelong-task-suites",
      "isaac-lab-training-evaluation-loop",
      "pi05-open-world-generalization",
      "robotwin-2",
    ],
    counterEventSlugs: [],
    nextWatch: [
      "观察任务泄漏控制、失败类型与返采后复测，研究成功率和团队演示不能直接替代客户现场连续任务的验收结果。",
    ],
  },
  {
    slug: "robot-data-factories",
    title: "机器人数据工厂成为接口与运营的共同议题",
    thesis:
      "DROID 的协作流程、AgiBot World 的数据工具资产与 ITU 的工作项目提供从生产实践到架构研究的观察线索，尚不足以确认统一工厂范式。",
    whyNow:
      "ITU 已公开机器人数据工厂联络函与草案基线元数据，可与现有采集和交付路径对照梳理接口，但受限正文没有在本轮读取。",
    pipelineStages: [
      "production-operations",
      "data-engineering-standards",
      "quality-training-feedback",
    ],
    eventSlugs: [
      "droid-consortium-site-operations",
      "agibot-world-bimanual-corpus",
      "itu-robot-data-factory",
    ],
    counterEventSlugs: [],
    nextWatch: [
      "观察正式可读草案、审批状态与可验证的工厂运营报告；不从项目标题推断具体架构层数、已生效标准或已验收产能。",
    ],
  },
];
