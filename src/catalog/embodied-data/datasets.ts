import type { DatasetEventRole, DatasetProfile } from "../../domain/embodied-data-objects.js";

export interface EmbodiedDatasetCatalogEntry {
  slug: string;
  profile: DatasetProfile;
  events: Array<{ eventSlug: string; role: DatasetEventRole }>;
}

type DatasetInput = Pick<
  DatasetProfile,
  | "name"
  | "publisher"
  | "releaseDate"
  | "canonicalUrl"
  | "pipelineStages"
  | "scenarios"
  | "embodiments"
  | "tasks"
  | "modalities"
  | "acquisitionMethods"
> &
  Partial<
    Pick<
      DatasetProfile,
      | "version"
      | "dataFormats"
      | "sensorConfiguration"
      | "synchronization"
      | "calibration"
      | "annotations"
      | "qualityMethods"
      | "license"
      | "useCases"
      | "limitations"
    >
  >;

const dataset = (
  slug: string,
  input: DatasetInput,
  eventSlug: string,
): EmbodiedDatasetCatalogEntry => ({
  slug,
  profile: {
    ...input,
    version: input.version ?? null,
    scaleClaims: [],
    dataFormats: input.dataFormats ?? [],
    sensorConfiguration: input.sensorConfiguration ?? [],
    synchronization: input.synchronization ?? [],
    calibration: input.calibration ?? [],
    annotations: input.annotations ?? [],
    qualityMethods: input.qualityMethods ?? ["task replay and schema validation"],
    license: input.license ?? null,
    access: { mode: "open", url: input.canonicalUrl },
    useCases: input.useCases ?? ["robot policy training", "data pipeline evaluation"],
    knownResults: [],
    limitations: input.limitations ?? [
      "Published coverage does not represent every deployment environment.",
    ],
    evidenceStatus: "verified",
  },
  events: [{ eventSlug, role: "release" }],
});

export const embodiedDatasets: EmbodiedDatasetCatalogEntry[] = [
  dataset(
    "droid",
    {
      name: "DROID",
      publisher: "DROID Dataset Team",
      releaseDate: "2024-03-19",
      canonicalUrl: "https://droid-dataset.github.io/",
      pipelineStages: ["acquisition-route", "production-operations"],
      scenarios: ["in-the-wild manipulation"],
      embodiments: ["single-arm"],
      tasks: ["manipulation"],
      modalities: ["rgb", "joint-state", "action", "language"],
      acquisitionMethods: ["teleoperation"],
      dataFormats: ["trajectory dataset"],
      qualityMethods: ["shared hardware specification", "cross-site collection protocol"],
    },
    "droid-distributed-collection",
  ),
  dataset(
    "open-x-embodiment",
    {
      name: "Open X-Embodiment",
      publisher: "Open X-Embodiment Collaboration",
      releaseDate: "2023-10-13",
      canonicalUrl: "https://robotics-transformer-x.github.io/",
      pipelineStages: ["data-engineering-standards", "acquisition-route"],
      scenarios: ["cross-embodiment integration"],
      embodiments: ["single-arm", "dual-arm", "mobile-manipulator"],
      tasks: ["manipulation"],
      modalities: ["rgb", "joint-state", "action", "language"],
      acquisitionMethods: ["hybrid"],
      dataFormats: ["RLDS"],
    },
    "open-x-standardized-datasets",
  ),
  dataset(
    "bridgedata-v2",
    {
      name: "BridgeData V2",
      publisher: "UC Berkeley RAIL",
      releaseDate: "2023-08-24",
      canonicalUrl: "https://rail-berkeley.github.io/bridgedata/",
      pipelineStages: ["acquisition-route"],
      scenarios: ["multi-environment tabletop manipulation"],
      embodiments: ["single-arm"],
      tasks: ["manipulation"],
      modalities: ["rgb", "joint-state", "action", "language"],
      acquisitionMethods: ["teleoperation"],
    },
    "bridgedata-v2-reusable-demonstrations",
  ),
  dataset(
    "rh20t",
    {
      name: "RH20T",
      publisher: "Shanghai Jiao Tong University",
      releaseDate: "2023-07-02",
      canonicalUrl: "https://rh20t.github.io/",
      pipelineStages: ["multimodal-capture"],
      scenarios: ["contact-rich manipulation"],
      embodiments: ["single-arm"],
      tasks: ["manipulation"],
      modalities: ["rgb", "depth", "force-torque", "joint-state", "action"],
      acquisitionMethods: ["teleoperation"],
      synchronization: ["time-aligned sensor streams"],
      calibration: ["camera and force sensor calibration"],
    },
    "rh20t-force-aware-capture",
  ),
  dataset(
    "roboset",
    {
      name: "RoboSet",
      publisher: "RoboSet Project",
      releaseDate: "2023-09-05",
      canonicalUrl: "https://robopen.github.io/roboset/",
      pipelineStages: ["production-operations"],
      scenarios: ["repeatable robot demonstrations"],
      embodiments: ["single-arm"],
      tasks: ["manipulation"],
      modalities: ["rgb", "joint-state", "action"],
      acquisitionMethods: ["teleoperation"],
    },
    "roboset-reproducible-production-baseline",
  ),
  dataset(
    "robomind",
    {
      name: "RoboMIND",
      publisher: "Open X-Humanoid",
      releaseDate: "2024-12-18",
      canonicalUrl: "https://x-humanoid-robomind.github.io/",
      pipelineStages: ["acquisition-route", "quality-training-feedback"],
      scenarios: ["multi-embodiment manipulation"],
      embodiments: ["single-arm", "dual-arm", "humanoid"],
      tasks: ["manipulation"],
      modalities: ["rgb", "joint-state", "action", "language"],
      acquisitionMethods: ["teleoperation", "simulation"],
      annotations: ["task descriptions", "failure reasons"],
    },
    "robomind-unified-teleoperation",
  ),
  dataset(
    "agibot-world",
    {
      name: "AgiBot World",
      publisher: "OpenDriveLab and AgiBot",
      releaseDate: "2025-03-09",
      canonicalUrl: "https://github.com/OpenDriveLab/AgiBot-World",
      pipelineStages: ["acquisition-route"],
      scenarios: ["bimanual manipulation"],
      embodiments: ["dual-arm", "humanoid"],
      tasks: ["manipulation", "loco-manipulation"],
      modalities: ["rgb", "joint-state", "action", "language"],
      acquisitionMethods: ["teleoperation"],
    },
    "agibot-world-bimanual-corpus",
  ),
  dataset(
    "holoassist",
    {
      name: "HoloAssist",
      publisher: "Microsoft Research",
      releaseDate: "2023-09-29",
      canonicalUrl: "https://holoassist.github.io/",
      pipelineStages: ["multimodal-capture"],
      scenarios: ["procedural human assistance"],
      embodiments: ["wearable-human"],
      tasks: ["human-robot-interaction"],
      modalities: ["rgb", "depth", "audio", "pose", "language"],
      acquisitionMethods: ["wearable"],
    },
    "holoassist-multimodal-human-demonstration",
  ),
  dataset(
    "ego-exo4d",
    {
      name: "Ego-Exo4D",
      publisher: "Ego4D Consortium",
      releaseDate: "2023-11-30",
      canonicalUrl: "https://ego-exo4d-data.org/",
      pipelineStages: ["multimodal-capture"],
      scenarios: ["human skill capture"],
      embodiments: ["wearable-human"],
      tasks: ["human-robot-interaction"],
      modalities: ["rgb", "audio", "pose"],
      acquisitionMethods: ["wearable"],
      synchronization: ["ego and exo camera synchronization"],
    },
    "ego-exo4d-synchronized-demonstrations",
  ),
  dataset(
    "libero",
    {
      name: "LIBERO",
      publisher: "Lifelong Robot Learning Lab",
      releaseDate: "2023-06-06",
      canonicalUrl: "https://github.com/Lifelong-Robot-Learning/LIBERO",
      pipelineStages: ["demand-definition", "quality-training-feedback"],
      scenarios: ["lifelong tabletop manipulation"],
      embodiments: ["single-arm"],
      tasks: ["manipulation"],
      modalities: ["rgb", "joint-state", "action", "language"],
      acquisitionMethods: ["simulation"],
    },
    "libero-lifelong-task-suites",
  ),
  dataset(
    "robocasa",
    {
      name: "RoboCasa",
      publisher: "RoboCasa Project",
      releaseDate: "2024-06-04",
      canonicalUrl: "https://github.com/robocasa/robocasa",
      pipelineStages: ["quality-training-feedback"],
      scenarios: ["synthetic household manipulation"],
      embodiments: ["single-arm", "mobile-manipulator"],
      tasks: ["manipulation", "loco-manipulation"],
      modalities: ["rgb", "depth", "joint-state", "action"],
      acquisitionMethods: ["simulation", "synthetic"],
    },
    "robocasa-synthetic-household-data",
  ),
  dataset(
    "behavior-1k",
    {
      name: "BEHAVIOR-1K",
      publisher: "Stanford Vision and Learning Lab",
      releaseDate: "2024-02-29",
      canonicalUrl: "https://github.com/StanfordVL/BEHAVIOR-1K",
      pipelineStages: ["demand-definition", "quality-training-feedback"],
      scenarios: ["household activities"],
      embodiments: ["mobile-manipulator"],
      tasks: ["loco-manipulation"],
      modalities: ["rgb", "depth", "joint-state", "action"],
      acquisitionMethods: ["simulation"],
    },
    "behavior-1k-task-definition",
  ),
];
