import type { EmbodiedPipelineStage } from "../../domain/embodied-data.js";

export interface EmbodiedTrackCatalogEntry {
  slug: EmbodiedPipelineStage;
  name: string;
  description: string;
  nameEn: string;
  descriptionEn: string;
  color: string;
  icon: string;
  order: number;
}

export const embodiedTracks: EmbodiedTrackCatalogEntry[] = [
  {
    slug: "demand-definition",
    name: "需求与任务定义",
    description: "判断采什么、为什么采，以及任务、场景和验收条件如何定义。",
    nameEn: "Demand and task definition",
    descriptionEn:
      "Decide what data to collect, why it is needed, and how tasks, scenarios, and acceptance criteria are defined.",
    color: "#d95d39",
    icon: "01",
    order: 10,
  },
  {
    slug: "acquisition-route",
    name: "采集技术路线",
    description: "比较遥操作、人类示范、自主采集、仿真与混合生产方式。",
    nameEn: "Acquisition route",
    descriptionEn:
      "Compare teleoperation, human demonstration, autonomous collection, simulation, and hybrid production routes.",
    color: "#f09a3e",
    icon: "02",
    order: 20,
  },
  {
    slug: "multimodal-capture",
    name: "多模态采集设备",
    description: "跟踪视觉、深度、力觉、触觉、位姿和动作数据的同步采集边界。",
    nameEn: "Multimodal capture",
    descriptionEn:
      "Track the synchronized capture boundaries for vision, depth, force, touch, pose, and action data.",
    color: "#d1a72c",
    icon: "03",
    order: 30,
  },
  {
    slug: "production-operations",
    name: "生产运营与成本",
    description: "观察站点、设备、人员、吞吐、成本与交付稳定性的生产约束。",
    nameEn: "Production operations and cost",
    descriptionEn:
      "Observe production constraints across sites, equipment, staffing, throughput, cost, and delivery stability.",
    color: "#3f8f6b",
    icon: "04",
    order: 40,
  },
  {
    slug: "data-engineering-standards",
    name: "数据工程与标准",
    description: "跟踪清洗、标注、格式化、版本化、互操作和数据治理标准。",
    nameEn: "Data engineering and standards",
    descriptionEn:
      "Track cleaning, annotation, formatting, versioning, interoperability, and data-governance standards.",
    color: "#347f9b",
    icon: "05",
    order: 50,
  },
  {
    slug: "quality-training-feedback",
    name: "质量验收与训练反馈",
    description: "验证数据是否有效，并把评测、训练和部署结果反馈到下一轮采集。",
    nameEn: "Quality acceptance and training feedback",
    descriptionEn:
      "Verify whether data is effective and feed evaluation, training, and deployment results into the next collection cycle.",
    color: "#7257a8",
    icon: "06",
    order: 60,
  },
];
