import type { StandardEventRole, StandardProfile } from "../../domain/embodied-data-objects.js";

export interface EmbodiedStandardCatalogEntry {
  slug: string;
  profile: StandardProfile;
  events: Array<{ eventSlug: string; role: StandardEventRole }>;
}

const standard = (
  slug: string,
  profile: StandardProfile,
  eventSlug: string,
): EmbodiedStandardCatalogEntry => ({
  slug,
  profile,
  events: [{ eventSlug, role: "publication" }],
});

export const embodiedStandards: EmbodiedStandardCatalogEntry[] = [
  standard(
    "rlds",
    {
      name: "RLDS",
      standardType: "project-format",
      organization: "Google Research",
      version: null,
      lifecycle: "active",
      canonicalUrl: "https://github.com/google-research/rlds",
      pipelineStages: ["data-engineering-standards"],
      areas: ["schema", "metadata", "storage"],
      implementations: ["TensorFlow Datasets", "Open X-Embodiment"],
      compatibleTools: ["TensorFlow"],
      adopters: ["Open X-Embodiment Collaboration"],
      migrationRequirements: ["Map source trajectories into episode and step semantics."],
      verifiedAt: "2026-09-20T00:00:00.000Z",
      evidenceStatus: "verified",
    },
    "rlds-episodic-data-contract",
  ),
  standard(
    "lerobot-dataset-v3",
    {
      name: "LeRobotDataset v3",
      standardType: "project-format",
      organization: "Hugging Face",
      version: "v3",
      lifecycle: "active",
      canonicalUrl: "https://github.com/huggingface/lerobot",
      pipelineStages: ["data-engineering-standards"],
      areas: ["schema", "metadata", "storage"],
      implementations: ["LeRobotDataset"],
      compatibleTools: ["LeRobot", "Hugging Face Hub"],
      adopters: [],
      migrationRequirements: [
        "Validate feature schemas, episode indexes, media paths, and metadata.",
      ],
      verifiedAt: "2026-09-20T00:00:00.000Z",
      evidenceStatus: "verified",
    },
    "lerobot-open-dataset-toolchain",
  ),
  standard(
    "ros2-rosbag2",
    {
      name: "ROS 2 rosbag2",
      standardType: "de-facto",
      organization: "Open Source Robotics Foundation",
      version: null,
      lifecycle: "active",
      canonicalUrl: "https://github.com/ros2/rosbag2",
      pipelineStages: ["multimodal-capture", "data-engineering-standards"],
      areas: ["interface", "time-sync", "storage", "metadata"],
      implementations: ["rosbag2_storage", "rosbag2_transport"],
      compatibleTools: ["ROS 2"],
      adopters: [],
      migrationRequirements: [
        "Preserve message definitions, timestamps, QoS context, and storage plugin versions.",
      ],
      verifiedAt: "2026-09-20T00:00:00.000Z",
      evidenceStatus: "verified",
    },
    "rosbag2-recording-storage-plugins",
  ),
  standard(
    "mcap",
    {
      name: "MCAP",
      standardType: "de-facto",
      organization: "Foxglove",
      version: null,
      lifecycle: "active",
      canonicalUrl: "https://github.com/foxglove/mcap",
      pipelineStages: ["multimodal-capture", "data-engineering-standards"],
      areas: ["schema", "storage", "metadata", "time-sync"],
      implementations: ["MCAP libraries"],
      compatibleTools: ["Foxglove", "ROS tooling"],
      adopters: [],
      migrationRequirements: [
        "Verify message schema identifiers, indexes, compression, and timestamp semantics.",
      ],
      verifiedAt: "2026-09-20T00:00:00.000Z",
      evidenceStatus: "verified",
    },
    "mcap-interoperable-sensor-container",
  ),
];
