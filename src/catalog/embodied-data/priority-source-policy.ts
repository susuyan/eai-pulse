export interface PrioritySourcePolicy {
  status: "pending" | "restricted" | "allowed_metadata";
  reviewedAt: string;
  reviewer: string;
  reason: string;
  evidenceUrls: string[];
}

const reviewedAt = "2026-09-21T07:19:15.000Z";
const reviewer = "repository-policy-review";
const pending = (reason: string, ...evidenceUrls: string[]): PrioritySourcePolicy => ({
  status: "pending",
  reviewedAt,
  reviewer,
  reason,
  evidenceUrls,
});
const github = pending(
  "The official releases API is documented, but its robots endpoint returned 404. Missing robots and repository-content reuse remain pending under this cohort policy. No Atom or HTML fallback is permitted.",
  "https://api.github.com/robots.txt",
  "https://docs.github.com/en/rest/releases/releases#list-releases",
  "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms",
);

export const prioritySourcePolicies: Readonly<Record<string, PrioritySourcePolicy>> = {
  "samr-standards": pending(
    "Robots returned 404. Metadata automation permission remains unverified.",
    "https://www.samr.gov.cn/robots.txt",
    "https://www.samr.gov.cn/bzjss/",
  ),
  "beijing-humanoid-center": pending(
    "Robots has no path prohibition, but the official listing gives no explicit automated metadata reuse terms.",
    "https://www.x-humanoid.com/robots.txt",
    "https://www.x-humanoid.com/news.html",
  ),
  internrobotics: github,
  "horizon-holomotion": github,
  opendrivelab: pending(
    "Robots defines use-specific content signals without granting a corresponding use. Automated intelligence extraction remains unapproved.",
    "https://opendrivelab.com/robots.txt",
  ),
  "pnp-robotics": pending(
    "Robots returned 404. Metadata automation permission remains unverified.",
    "https://www.pnprobotics.com/robots.txt",
    "https://www.pnprobotics.com/",
  ),
  "nvidia-isaac-groot": github,
  "figure-ai": {
    status: "restricted",
    reviewedAt,
    reviewer,
    reason:
      "Site terms limit content to personal use and require express written permission for other use. This intelligence workflow has no such permission.",
    evidenceUrls: [
      "https://www.figure.ai/robots.txt",
      "https://www.figure.ai/terms-and-conditions",
    ],
  },
  "one-x": pending(
    "Robots returned 404. Metadata automation permission remains unverified.",
    "https://www.1x.tech/robots.txt",
    "https://www.1x.tech/ai",
  ),
  robocasa: github,
  "nist-physical-ai": {
    status: "allowed_metadata",
    reviewedAt,
    reviewer,
    reason:
      "NIST permits distribution of unmarked public information; robots does not prohibit this program page. Review found no copyright notice on its title, canonical URL or Created date. Only those fields are allowed; linked publications, images, contacts and third-party content are excluded.",
    evidenceUrls: [
      "https://www.nist.gov/robots.txt",
      "https://www.nist.gov/copyrights-disclaimers",
      "https://www.nist.gov/programs-projects/physical-ai-and-data-generation-robotics",
    ],
  },
  "itu-robot-data-factory": pending(
    "Site terms distinguish noncommercial use from uses requiring written permission. This workflow's reuse permission is unresolved; private documents and standard text remain excluded.",
    "https://www.itu.int/robots.txt",
    "https://www.itu.int/en/about/Pages/terms-of-use.aspx",
  ),
};
