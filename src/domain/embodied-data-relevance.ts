import type { EmbodiedPipelineStage } from "./embodied-data.js";

export interface EmbodiedDataRelevanceInput {
  title: string;
  summary: string;
  technicalInsight: string;
  industryInsight: string;
  businessValue: string;
  category: string;
  keywords: string[];
}

export interface EmbodiedDataRelevanceAssessment {
  decision: "include" | "review" | "reject";
  matchedStages: EmbodiedPipelineStage[];
  reasons: string[];
}

const EMBODIED_ANCHORS = [
  "embodied",
  "humanoid",
  "robot",
  "robotic",
  "robotics",
  "manipulation",
  "dexterous",
  "teleoperation",
  "vla",
  "具身",
  "机器人",
  "遥操作",
  "灵巧手",
];

const DATA_SIGNAL_GROUPS = [
  [
    "dataset",
    "training data",
    "demonstration data",
    "robot data",
    "data service",
    "data provider",
    "data collection",
    "数据集",
    "训练数据",
    "示教数据",
    "数据采集",
  ],
  ["task definition", "data requirement", "scenario taxonomy", "任务定义", "数据需求"],
  ["teleoperation", "manual demonstration", "simulation data", "synthetic data", "遥操作"],
  ["rgb-d", "rgbd", "force-torque", "joint state", "tactile", "multimodal", "多模态"],
  ["demonstration hours", "collection throughput", "data factory", "annotation throughput"],
  ["schema", "数据模式"],
  ["metadata", "元数据"],
  ["interchange format", "data format", "数据格式"],
  ["standard", "标准"],
  ["data quality", "acceptance threshold", "trajectory validation", "数据质量", "验收阈值"],
  ["training effect", "success rate", "model performance", "训练效果", "成功率"],
] as const;

const STAGE_TERMS: ReadonlyArray<{
  stage: EmbodiedPipelineStage;
  terms: readonly string[];
}> = [
  {
    stage: "demand-definition",
    terms: ["task definition", "data requirement", "scenario taxonomy", "任务定义", "数据需求"],
  },
  {
    stage: "acquisition-route",
    terms: [
      "teleoperation",
      "demonstration",
      "manual demonstration",
      "demonstration data",
      "data collection",
      "simulation data",
      "synthetic data",
      "internet video",
      "遥操作",
      "数据采集",
    ],
  },
  {
    stage: "multimodal-capture",
    terms: ["rgb-d", "rgbd", "force-torque", "joint state", "tactile", "multimodal", "多模态"],
  },
  {
    stage: "production-operations",
    terms: [
      "demonstration hours",
      "collection throughput",
      "data factory",
      "annotation throughput",
      "示教小时",
      "采集吞吐",
    ],
  },
  {
    stage: "data-engineering-standards",
    terms: [
      "schema",
      "metadata",
      "interchange format",
      "data format",
      "standard",
      "provenance",
      "元数据",
      "数据格式",
      "标准",
    ],
  },
  {
    stage: "quality-training-feedback",
    terms: [
      "data quality",
      "acceptance threshold",
      "acceptance contract",
      "trajectory validation",
      "training effect",
      "success rate",
      "model performance",
      "数据质量",
      "验收阈值",
      "训练效果",
      "成功率",
    ],
  },
];

const NEGATIVE_CUES = [
  " no ",
  " not ",
  " without ",
  " unclear ",
  " unverified ",
  " unknown ",
  " doesn't ",
  " does not ",
  " do not ",
  " is not ",
  " are not ",
  "未披露",
  "不明确",
  "不清楚",
  "未经证实",
  "没有",
  "无直接",
];

export function assessEmbodiedDataRelevance(
  input: EmbodiedDataRelevanceInput,
): EmbodiedDataRelevanceAssessment {
  const corpus = positiveCorpus(input);
  const evidenceCorpus = positiveCorpus({ ...input, businessValue: "" });
  const hasEmbodiedAnchor = matchesAny(corpus, EMBODIED_ANCHORS);
  const matchedSignalCount = DATA_SIGNAL_GROUPS.filter((terms) =>
    matchesAny(evidenceCorpus, terms),
  ).length;
  const hasDataPipelineAnchor = matchedSignalCount > 0;
  const matchedStages = STAGE_TERMS.filter(({ terms }) => matchesAny(evidenceCorpus, terms)).map(
    ({ stage }) => stage,
  );

  if (!hasEmbodiedAnchor || !hasDataPipelineAnchor) {
    const reasons: string[] = [];
    if (!hasEmbodiedAnchor) reasons.push("embodied_anchor_missing");
    if (!hasDataPipelineAnchor) reasons.push("data_pipeline_anchor_missing");
    return { decision: "reject", matchedStages, reasons };
  }

  if (matchedSignalCount < 2) {
    return {
      decision: "review",
      matchedStages,
      reasons: [
        "data_impact_too_thin",
        ...(matchedStages.length > 0 ? ["pipeline_stage_matched"] : []),
      ],
    };
  }

  return {
    decision: "include",
    matchedStages,
    reasons: ["embodied_data_scope_matched", "pipeline_stage_matched"],
  };
}

function positiveCorpus(input: EmbodiedDataRelevanceInput): string {
  return [
    input.title,
    input.summary,
    input.technicalInsight,
    input.industryInsight,
    input.businessValue,
    input.category,
    ...input.keywords,
  ]
    .map(normalize)
    .filter((value) => !NEGATIVE_CUES.some((cue) => ` ${value} `.includes(cue)))
    .join("\n");
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function matchesAny(corpus: string, terms: readonly string[]): boolean {
  return terms.some((term) => corpus.includes(normalize(term)));
}
