import type {
  ActorCapabilityEvidenceRole,
  ActorDataCapability,
} from "../../domain/embodied-data-objects.js";

export interface EmbodiedPeerCapability {
  profile: ActorDataCapability;
  eventSlug: string;
  evidenceRole: ActorCapabilityEvidenceRole;
}

export interface EmbodiedPeerCatalogEntry {
  actorSlug: string;
  actorName: string;
  actorType: "company" | "lab" | "consortium";
  region: "CN" | "GLOBAL";
  websiteUrl: string;
  capabilities: EmbodiedPeerCapability[];
}

const peer = (
  input: Omit<EmbodiedPeerCatalogEntry, "capabilities"> & {
    capabilityKey: string;
    pipelineStages: ActorDataCapability["pipelineStages"];
    claimText: string;
    sourceUrl: string;
    claimedAt: string;
    eventSlug: string;
    limitations: string[];
  },
): EmbodiedPeerCatalogEntry => ({
  actorSlug: input.actorSlug,
  actorName: input.actorName,
  actorType: input.actorType,
  region: input.region,
  websiteUrl: input.websiteUrl,
  capabilities: [
    {
      profile: {
        capabilityKey: input.capabilityKey,
        pipelineStages: input.pipelineStages,
        claimText: input.claimText,
        claimant: "company",
        sourceUrl: input.sourceUrl,
        claimedAt: input.claimedAt,
        verificationStatus: "self-claimed",
        verifiedAt: null,
        confidence: 60,
        limitations: input.limitations,
      },
      eventSlug: input.eventSlug,
      evidenceRole: "claim",
    },
  ],
});

export const embodiedPeers: EmbodiedPeerCatalogEntry[] = [
  peer({
    actorSlug: "agibot",
    actorName: "AgiBot",
    actorType: "company",
    region: "CN",
    websiteUrl: "https://github.com/OpenDriveLab/AgiBot-World",
    capabilityKey: "open-bimanual-data-stack",
    pipelineStages: ["acquisition-route", "data-engineering-standards"],
    claimText:
      "AgiBot and OpenDriveLab publish a bimanual robot data, tooling, and baseline stack through AgiBot World.",
    sourceUrl: "https://github.com/OpenDriveLab/AgiBot-World",
    claimedAt: "2025-03-09T00:00:00.000Z",
    eventSlug: "agibot-world-bimanual-corpus",
    limitations: [
      "The claim is based on the project publisher's materials and is not an independent delivery audit.",
    ],
  }),
  peer({
    actorSlug: "open-x-humanoid",
    actorName: "Open X-Humanoid / RoboMIND",
    actorType: "consortium",
    region: "CN",
    websiteUrl: "https://x-humanoid-robomind.github.io/",
    capabilityKey: "multi-embodiment-teleoperation-platform",
    pipelineStages: ["acquisition-route", "quality-training-feedback"],
    claimText:
      "RoboMIND publishes a unified teleoperation and digital-twin data pipeline for multiple robot embodiments.",
    sourceUrl: "https://x-humanoid-robomind.github.io/",
    claimedAt: "2024-12-18T00:00:00.000Z",
    eventSlug: "robomind-unified-teleoperation",
    limitations: [
      "Published benchmark results do not establish production reliability for external teams.",
    ],
  }),
  peer({
    actorSlug: "galaxea-ai",
    actorName: "Galaxea AI",
    actorType: "company",
    region: "CN",
    websiteUrl: "https://www.galaxea-ai.com/",
    capabilityKey: "mobile-manipulation-data-loop",
    pipelineStages: ["quality-training-feedback"],
    claimText:
      "Galaxea AI presents a mobile manipulation stack that connects robot hardware, learning models, and data assets.",
    sourceUrl: "https://www.galaxea-ai.com/",
    claimedAt: "2025-01-15T00:00:00.000Z",
    eventSlug: "galaxea-open-data-feedback-loop",
    limitations: ["Public materials do not independently verify fleet-scale data operations."],
  }),
  peer({
    actorSlug: "unitree-robotics",
    actorName: "Unitree Robotics",
    actorType: "company",
    region: "CN",
    websiteUrl: "https://github.com/unitreerobotics/unitree_rl_gym",
    capabilityKey: "simulation-training-entrypoint",
    pipelineStages: ["production-operations", "quality-training-feedback"],
    claimText:
      "Unitree publishes a simulation training and deployment entry point for supported robot platforms.",
    sourceUrl: "https://github.com/unitreerobotics/unitree_rl_gym",
    claimedAt: "2024-08-19T00:00:00.000Z",
    eventSlug: "unitree-simulation-training-loop",
    limitations: [
      "Repository availability does not prove transfer quality for every hardware and firmware version.",
    ],
  }),
  peer({
    actorSlug: "fourier-intelligence",
    actorName: "Fourier Intelligence",
    actorType: "company",
    region: "CN",
    websiteUrl: "https://fourierintelligence.com/",
    capabilityKey: "humanoid-training-platform",
    pipelineStages: ["production-operations"],
    claimText:
      "Fourier Intelligence presents humanoid hardware, development, and training capabilities as one platform offering.",
    sourceUrl: "https://fourierintelligence.com/",
    claimedAt: "2024-01-30T00:00:00.000Z",
    eventSlug: "fourier-humanoid-training-platform",
    limitations: [
      "Public product descriptions do not disclose comparable data quality or throughput evidence.",
    ],
  }),
  peer({
    actorSlug: "ubtech-robotics",
    actorName: "UBTECH Robotics",
    actorType: "company",
    region: "CN",
    websiteUrl: "https://www.ubtrobot.com/",
    capabilityKey: "industrial-humanoid-task-program",
    pipelineStages: ["demand-definition", "production-operations"],
    claimText:
      "UBTECH presents industrial manufacturing tasks as a deployment and training focus for humanoid robots.",
    sourceUrl: "https://www.ubtrobot.com/",
    claimedAt: "2024-07-01T00:00:00.000Z",
    eventSlug: "ubtech-industrial-task-program",
    limitations: [
      "The available claim does not independently establish continuous task success or intervention rates.",
    ],
  }),
  peer({
    actorSlug: "robotera",
    actorName: "RobotEra",
    actorType: "company",
    region: "CN",
    websiteUrl: "https://www.robotera.com/",
    capabilityKey: "humanoid-teleoperation-workflow",
    pipelineStages: ["production-operations"],
    claimText:
      "RobotEra presents teleoperation and robot learning as parts of its humanoid development workflow.",
    sourceUrl: "https://www.robotera.com/",
    claimedAt: "2024-08-21T00:00:00.000Z",
    eventSlug: "robotera-teleoperation-operations",
    limitations: ["Public materials do not provide an independent audit of collection operations."],
  }),
  peer({
    actorSlug: "astribot",
    actorName: "Astribot",
    actorType: "company",
    region: "CN",
    websiteUrl: "https://www.astribot.com/",
    capabilityKey: "dexterous-humanoid-manipulation",
    pipelineStages: ["multimodal-capture"],
    claimText:
      "Astribot presents dexterous humanoid manipulation demonstrations and an integrated robot technology stack.",
    sourceUrl: "https://www.astribot.com/",
    claimedAt: "2024-04-29T00:00:00.000Z",
    eventSlug: "astribot-manipulation-capture-stack",
    limitations: [
      "Demonstrations alone do not verify repeatability, failure handling, or data production throughput.",
    ],
  }),
  peer({
    actorSlug: "nexdata",
    actorName: "Nexdata",
    actorType: "company",
    region: "CN",
    websiteUrl: "https://www.nexdata.ai/industries/embodied-ai",
    capabilityKey: "embodied-data-delivery-services",
    pipelineStages: ["demand-definition", "production-operations"],
    claimText:
      "Nexdata presents collection, annotation, and evaluation services for embodied AI data projects.",
    sourceUrl: "https://www.nexdata.ai/industries/embodied-ai",
    claimedAt: "2024-12-01T00:00:00.000Z",
    eventSlug: "nexdata-embodied-delivery-scope",
    limitations: [
      "The service description does not independently verify project quality, licensing, or delivery outcomes.",
    ],
  }),
  peer({
    actorSlug: "discover-robotics",
    actorName: "DISCOVER Robotics",
    actorType: "company",
    region: "CN",
    websiteUrl: "https://www.discover-robotics.com/en/data-collection",
    capabilityKey: "managed-robot-data-collection",
    pipelineStages: ["acquisition-route", "production-operations"],
    claimText:
      "DISCOVER Robotics presents a managed robot data acquisition and data management service path.",
    sourceUrl: "https://www.discover-robotics.com/en/data-collection",
    claimedAt: "2025-02-01T00:00:00.000Z",
    eventSlug: "discover-managed-collection-route",
    limitations: [
      "The claim is a vendor statement without an independent customer delivery audit.",
    ],
  }),
  peer({
    actorSlug: "hugging-face-lerobot",
    actorName: "Hugging Face LeRobot",
    actorType: "lab",
    region: "GLOBAL",
    websiteUrl: "https://github.com/huggingface/lerobot",
    capabilityKey: "open-robot-data-toolchain",
    pipelineStages: ["data-engineering-standards"],
    claimText:
      "LeRobot publishes an open robot dataset, training, and sharing toolchain integrated with Hugging Face infrastructure.",
    sourceUrl: "https://github.com/huggingface/lerobot",
    claimedAt: "2024-05-14T00:00:00.000Z",
    eventSlug: "lerobot-open-dataset-toolchain",
    limitations: [
      "Tool availability does not guarantee compatibility with every robot or internal schema.",
    ],
  }),
  peer({
    actorSlug: "nvidia-isaac",
    actorName: "NVIDIA Isaac",
    actorType: "company",
    region: "GLOBAL",
    websiteUrl: "https://github.com/isaac-sim/IsaacLab",
    capabilityKey: "simulation-data-training-stack",
    pipelineStages: ["acquisition-route", "quality-training-feedback"],
    claimText:
      "NVIDIA Isaac publishes simulation, synthetic data, task environments, and robot learning interfaces.",
    sourceUrl: "https://github.com/isaac-sim/IsaacLab",
    claimedAt: "2024-04-01T00:00:00.000Z",
    eventSlug: "isaac-lab-training-evaluation-loop",
    limitations: [
      "Simulation capability does not independently verify transfer to a target physical deployment.",
    ],
  }),
  peer({
    actorSlug: "google-deepmind-robotics",
    actorName: "Google DeepMind Robotics",
    actorType: "lab",
    region: "GLOBAL",
    websiteUrl: "https://deepmind.google/discover/blog/",
    capabilityKey: "multi-task-robot-data-modeling",
    pipelineStages: ["demand-definition", "acquisition-route"],
    claimText:
      "Google Robotics publishes research on training shared robot policies from multi-task robot data.",
    sourceUrl: "https://arxiv.org/abs/2212.06817",
    claimedAt: "2022-12-13T00:00:00.000Z",
    eventSlug: "rt1-data-driven-robotics",
    limitations: [
      "Research results do not establish equivalent performance in external production environments.",
    ],
  }),
  peer({
    actorSlug: "droid-consortium",
    actorName: "DROID Consortium",
    actorType: "consortium",
    region: "GLOBAL",
    websiteUrl: "https://droid-dataset.github.io/",
    capabilityKey: "distributed-real-world-collection",
    pipelineStages: ["acquisition-route", "production-operations"],
    claimText:
      "The DROID consortium publishes a distributed real-world robot data collection protocol and reproducible hardware guide.",
    sourceUrl: "https://droid-dataset.github.io/",
    claimedAt: "2024-03-19T00:00:00.000Z",
    eventSlug: "droid-consortium-site-operations",
    limitations: [
      "The public project does not verify that every external site will reproduce the same quality distribution.",
    ],
  }),
  peer({
    actorSlug: "physical-intelligence",
    actorName: "Physical Intelligence",
    actorType: "lab",
    region: "GLOBAL",
    websiteUrl: "https://www.physicalintelligence.company/blog",
    capabilityKey: "cross-platform-data-mixture",
    pipelineStages: ["acquisition-route", "quality-training-feedback"],
    claimText:
      "Physical Intelligence presents heterogeneous robot data mixture as a foundation for its general robot policy work.",
    sourceUrl: "https://www.physicalintelligence.company/blog/pi0",
    claimedAt: "2024-10-31T00:00:00.000Z",
    eventSlug: "pi0-data-mixture-policy",
    limitations: [
      "The claim is based on publisher results and lacks an independent cross-platform reproduction.",
    ],
  }),
];
