type LandingPoint = {
  title: string;
  description: string;
};

type SiteConfig = {
  name: string;
  kicker: string;
  sourceUrl: string;
  url: string;
  landing: {
    headline: readonly [string, string];
    description: string;
    points: readonly [LandingPoint, LandingPoint, LandingPoint];
  };
};

export const site = {
  /** Project name - sidebar label + topbar crumb. Lowercase per brand. */
  name: "example",
  /** One-line descriptor under the name in the sidebar and landing eyebrow. */
  kicker: "A Frostyard project",
  /** Source links in the top bar and landing hero. */
  sourceUrl: "https://github.com/frostyard/example",
  /** Canonical site URL (sitemap, astro `site`). */
  url: "https://example-docs.bjk.workers.dev",
  /** Project-specific root-page copy. Keep each value concise. */
  landing: {
    headline: ["Meet example.", "Then build."],
    description: "A concise statement of what the project does and who it serves.",
    points: [
      {
        title: "Start with context",
        description: "Understand what the project does and where its boundary sits."
      },
      {
        title: "Get running",
        description: "Install the project and verify the first successful result."
      },
      {
        title: "Go deeper",
        description: "Move into concepts and reference material when needed."
      }
    ]
  }
} satisfies SiteConfig;
