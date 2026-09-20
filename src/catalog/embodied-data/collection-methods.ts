import type {
  CollectionMethodEventRole,
  CollectionMethodProfile,
} from "../../domain/embodied-data-objects.js";

export interface EmbodiedCollectionMethodCatalogEntry {
  slug: string;
  profile: CollectionMethodProfile;
  events: Array<{ eventSlug: string; role: CollectionMethodEventRole }>;
}

type MethodInput = Pick<
  CollectionMethodProfile,
  | "name"
  | "methodKind"
  | "canonicalUrl"
  | "pipelineStages"
  | "scenarios"
  | "embodiments"
  | "tasks"
  | "requiredEquipment"
  | "operatorRoles"
  | "modalities"
  | "deploymentComplexity"
  | "maturity"
> &
  Partial<
    Pick<
      CollectionMethodProfile,
      | "environmentRequirements"
      | "qualityBoundaries"
      | "safetyRisks"
      | "advantages"
      | "limitations"
      | "failureModes"
    >
  >;

const method = (
  slug: string,
  input: MethodInput,
  eventSlug: string,
): EmbodiedCollectionMethodCatalogEntry => ({
  slug,
  profile: {
    ...input,
    environmentRequirements: input.environmentRequirements ?? [],
    qualityBoundaries: input.qualityBoundaries ?? ["Validate synchronization and task completion."],
    throughputClaims: [],
    costClaims: [],
    safetyRisks: input.safetyRisks ?? ["Unsafe actions require an immediate operator stop path."],
    advantages: input.advantages ?? ["Provides data that is aligned with a defined task."],
    limitations: input.limitations ?? [
      "Coverage depends on task design and collection conditions.",
    ],
    failureModes: input.failureModes ?? ["Calibration drift or incomplete task execution."],
    evidenceStatus: "verified",
  },
  events: [{ eventSlug, role: "demonstration" }],
});

export const embodiedCollectionMethods: EmbodiedCollectionMethodCatalogEntry[] = [
  method(
    "teleoperation",
    {
      name: "Robot teleoperation",
      methodKind: "teleoperation",
      canonicalUrl: "https://droid-dataset.github.io/",
      pipelineStages: ["acquisition-route", "multimodal-capture", "production-operations"],
      scenarios: ["real-world manipulation"],
      embodiments: ["single-arm", "dual-arm", "humanoid"],
      tasks: ["manipulation", "loco-manipulation"],
      requiredEquipment: ["operator controller", "robot", "synchronized cameras"],
      operatorRoles: ["teleoperator", "site technician", "quality reviewer"],
      modalities: ["rgb", "joint-state", "action", "language"],
      deploymentComplexity: "high",
      maturity: "operational",
      qualityBoundaries: [
        "Control latency, calibration, and operator consistency must be measured.",
      ],
    },
    "droid-distributed-collection",
  ),
  method(
    "wearable-human-demonstration",
    {
      name: "Wearable human demonstration",
      methodKind: "wearable",
      canonicalUrl: "https://ego-exo4d-data.org/",
      pipelineStages: ["acquisition-route", "multimodal-capture"],
      scenarios: ["human skill capture"],
      embodiments: ["wearable-human"],
      tasks: ["human-robot-interaction", "manipulation"],
      requiredEquipment: ["egocentric camera", "optional external cameras"],
      operatorRoles: ["demonstrator", "capture technician"],
      modalities: ["rgb", "audio", "pose", "language"],
      deploymentComplexity: "medium",
      maturity: "operational",
      limitations: ["Human motion is not directly equivalent to a robot action trajectory."],
    },
    "ego-exo4d-synchronized-demonstrations",
  ),
  method(
    "autonomous-rollout",
    {
      name: "Autonomous policy rollout",
      methodKind: "autonomous",
      canonicalUrl: "https://rail-berkeley.github.io/bridgedata/",
      pipelineStages: ["acquisition-route", "quality-training-feedback"],
      scenarios: ["policy execution and failure mining"],
      embodiments: ["single-arm", "mobile-manipulator"],
      tasks: ["manipulation"],
      requiredEquipment: ["deployed robot", "safety monitor", "logging stack"],
      operatorRoles: ["safety operator", "policy evaluator"],
      modalities: ["rgb", "joint-state", "action"],
      deploymentComplexity: "high",
      maturity: "emerging",
      safetyRisks: ["Policy errors can damage equipment or create unsafe motion."],
      advantages: ["Collects on-policy successes and failure cases from the target stack."],
    },
    "bridgedata-v2-reusable-demonstrations",
  ),
  method(
    "simulation-synthetic-generation",
    {
      name: "Simulation and synthetic generation",
      methodKind: "simulation",
      canonicalUrl: "https://github.com/isaac-sim/IsaacLab",
      pipelineStages: ["acquisition-route", "quality-training-feedback"],
      scenarios: ["task randomization and rare-case generation"],
      embodiments: ["single-arm", "mobile-manipulator", "humanoid", "quadruped"],
      tasks: ["manipulation", "locomotion", "navigation", "loco-manipulation"],
      requiredEquipment: ["simulation runtime", "scene assets", "compute infrastructure"],
      operatorRoles: ["simulation engineer", "robot learning engineer"],
      modalities: ["rgb", "depth", "point-cloud", "joint-state", "action"],
      deploymentComplexity: "high",
      maturity: "operational",
      limitations: ["Synthetic coverage does not prove transfer to the real robot."],
    },
    "isaac-lab-training-evaluation-loop",
  ),
  method(
    "internet-video-transfer",
    {
      name: "Internet video transfer",
      methodKind: "internet-video",
      canonicalUrl: "https://holoassist.github.io/",
      pipelineStages: ["acquisition-route", "multimodal-capture"],
      scenarios: ["human activity representation pretraining"],
      embodiments: ["wearable-human"],
      tasks: ["human-robot-interaction", "manipulation"],
      requiredEquipment: ["licensed public video corpus", "video processing pipeline"],
      operatorRoles: ["data curator", "license reviewer", "annotation reviewer"],
      modalities: ["rgb", "audio", "language", "pose"],
      deploymentComplexity: "medium",
      maturity: "emerging",
      safetyRisks: ["Licensing and privacy constraints can prevent downstream reuse."],
      limitations: [
        "Video usually lacks robot actions, proprioception, and controlled viewpoints.",
      ],
    },
    "holoassist-multimodal-human-demonstration",
  ),
  method(
    "hybrid-collection",
    {
      name: "Hybrid embodied data collection",
      methodKind: "hybrid",
      canonicalUrl: "https://robotics-transformer-x.github.io/",
      pipelineStages: [
        "acquisition-route",
        "data-engineering-standards",
        "quality-training-feedback",
      ],
      scenarios: ["multi-source robot foundation model training"],
      embodiments: ["single-arm", "dual-arm", "mobile-manipulator", "humanoid"],
      tasks: ["manipulation", "loco-manipulation"],
      requiredEquipment: ["source adapters", "schema conversion", "quality evaluation suite"],
      operatorRoles: ["data engineer", "robot learning engineer", "quality reviewer"],
      modalities: ["rgb", "depth", "joint-state", "action", "language"],
      deploymentComplexity: "high",
      maturity: "emerging",
      qualityBoundaries: [
        "Each source must retain provenance, schema version, and evaluation results.",
      ],
      failureModes: ["One source dominates the mixture or loses its original semantic context."],
    },
    "open-x-standardized-datasets",
  ),
];
