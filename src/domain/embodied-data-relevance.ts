import type { EmbodiedPipelineStage } from "./embodied-data.js";

export interface EmbodiedDataRelevanceInput {
  title: string;
  summary: string;
  technicalInsight: string;
  industryInsight: string;
  businessValue: string;
  category: string;
  keywords: string[];
  originalSourceAvailable?: boolean;
}

export interface EmbodiedDataRelevanceEvidence {
  matched: boolean;
  matchedTerms: string[];
}

export interface EmbodiedDataRelevanceAssessment {
  decision: "include" | "review" | "reject";
  matchedStages: EmbodiedPipelineStage[];
  reasons: string[];
  embodimentAnchor: EmbodiedDataRelevanceEvidence;
  productionImpact: EmbodiedDataRelevanceEvidence;
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

const EXCLUSION_RULES: ReadonlyArray<{ reason: string; terms: readonly string[] }> = [
  { reason: "excluded_turing_test", terms: ["turing test", "图灵测试"] },
  {
    reason: "excluded_generic_agent",
    terms: ["generic multimodal agent", "multimodal agent", "通用多模态 agent"],
  },
  {
    reason: "excluded_architecture_only",
    terms: ["architecture scaling", "architecture-only", "model architecture result", "架构改进"],
  },
  { reason: "excluded_control_only", terms: ["control-only", "control law", "仅控制"] },
  {
    reason: "excluded_perception_only",
    terms: ["perception-only", "inference accuracy", "仅感知"],
  },
];

const NEGATION_PREFIXES = [
  "no ",
  "not ",
  "without ",
  "does not ",
  "do not ",
  "same ",
  "没有",
  "无",
  "不涉及",
  "未改变",
];

const UNCERTAINTY_CUES = [
  "not disclosed",
  "does not disclose",
  "no verified",
  "not measurable",
  "not yet measurable",
  "incomplete",
  "unknown",
  "unclear",
  "unverified",
  "未披露",
  "不明确",
  "待验证",
];

const NO_PRODUCTION_IMPACT_CUES = [
  "without any collection or dataset change",
  "no data-production problem changes",
  "no collection, standard, or quality artifact",
  "changes no pipeline decision",
  "does not change a production decision",
  "does not change embodied data production",
  "不改变数据生产",
];

export function assessEmbodiedDataRelevance(
  input: EmbodiedDataRelevanceInput,
): EmbodiedDataRelevanceAssessment {
  const corpus = evidenceCorpus(input);
  const embodimentTerms = findMatchedTerms(corpus, EMBODIED_ANCHORS);
  const productionTerms = DATA_SIGNAL_GROUPS.flatMap((terms) => findMatchedTerms(corpus, terms));
  const matchedSignalCount = DATA_SIGNAL_GROUPS.filter(
    (terms) => findMatchedTerms(corpus, terms).length > 0,
  ).length;
  const embodimentAnchor = evidence(embodimentTerms);
  const productionImpact = evidence(productionTerms);
  const matchedStages = STAGE_TERMS.filter(
    ({ terms }) => findMatchedTerms(corpus, terms).length > 0,
  ).map(({ stage }) => stage);

  const excluded = EXCLUSION_RULES.find(({ terms }) => matchesAny(corpus, terms));
  if (input.originalSourceAvailable === false) {
    return assessment(
      "reject",
      [],
      ["original_source_missing"],
      embodimentAnchor,
      productionImpact,
    );
  }
  if (excluded) {
    return assessment("reject", [], [excluded.reason], embodimentAnchor, productionImpact);
  }
  if (NO_PRODUCTION_IMPACT_CUES.some((cue) => corpus.includes(normalize(cue)))) {
    return assessment(
      "reject",
      [],
      ["data_pipeline_anchor_missing"],
      embodimentAnchor,
      productionImpact,
    );
  }
  if (
    normalize(input.category) === "financing" &&
    !matchesAny(corpus, ["data provider", "data service", "数据服务商"])
  ) {
    return assessment(
      "reject",
      [],
      ["excluded_financing_only"],
      embodimentAnchor,
      productionImpact,
    );
  }

  if (!embodimentAnchor.matched || !productionImpact.matched) {
    const reasons: string[] = [];
    if (!embodimentAnchor.matched) reasons.push("embodied_anchor_missing");
    if (!productionImpact.matched) reasons.push("data_pipeline_anchor_missing");
    return assessment("reject", matchedStages, reasons, embodimentAnchor, productionImpact);
  }

  if (matchedSignalCount < 2 || UNCERTAINTY_CUES.some((cue) => corpus.includes(normalize(cue)))) {
    return assessment(
      "review",
      matchedStages,
      [
        "data_impact_too_thin",
        "production_impact_ambiguous",
        "embodied_anchor_matched",
        ...(matchedStages.length > 0 ? ["pipeline_stage_matched"] : []),
      ],
      embodimentAnchor,
      productionImpact,
    );
  }

  return assessment(
    "include",
    matchedStages,
    [
      "embodied_data_scope_matched",
      "embodied_anchor_matched",
      "production_impact_matched",
      "pipeline_stage_matched",
    ],
    embodimentAnchor,
    productionImpact,
  );
}

function evidenceCorpus(input: EmbodiedDataRelevanceInput): string {
  return [input.title, input.summary, input.technicalInsight, input.industryInsight]
    .map(normalize)
    .join("\n");
}

function assessment(
  decision: EmbodiedDataRelevanceAssessment["decision"],
  matchedStages: EmbodiedPipelineStage[],
  reasons: string[],
  embodimentAnchor: EmbodiedDataRelevanceEvidence,
  productionImpact: EmbodiedDataRelevanceEvidence,
): EmbodiedDataRelevanceAssessment {
  return { decision, matchedStages, reasons, embodimentAnchor, productionImpact };
}

function evidence(matchedTerms: string[]): EmbodiedDataRelevanceEvidence {
  const uniqueTerms = [...new Set(matchedTerms)].sort();
  return { matched: uniqueTerms.length > 0, matchedTerms: uniqueTerms };
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function matchesAny(corpus: string, terms: readonly string[]): boolean {
  return findMatchedTerms(corpus, terms).length > 0;
}

function findMatchedTerms(corpus: string, terms: readonly string[]): string[] {
  return terms.filter((term) => hasPositiveOccurrence(corpus, normalize(term)));
}

function hasPositiveOccurrence(corpus: string, term: string): boolean {
  let offset = corpus.indexOf(term);
  while (offset >= 0) {
    const prefix = corpus.slice(Math.max(0, offset - 24), offset);
    if (!NEGATION_PREFIXES.some((cue) => prefix.endsWith(cue))) return true;
    offset = corpus.indexOf(term, offset + term.length);
  }
  return false;
}
