export interface SiteNavLink {
  href: string;
  name: string;
  description?: string;
}

export const SITE_LATEST = {
  description: "GPU-powered animated orb shaders",
  href: "https://shadercn.vercel.app",
  name: "shadercn",
} as const satisfies SiteNavLink;

export const SITE_REGISTRIES = [
  { href: "https://editorcn.vercel.app", name: "editorcn" },
  { href: "https://pdfcn.dev", name: "pdfcn" },
  { href: "https://termcn.dev", name: "termcn" },
  { href: "https://framecn.dev", name: "framecn" },
  { href: "https://ogimagecn.com", name: "ogimagecn" },
  { href: "https://agentcn.run", name: "agentcn" },
  { href: "https://emailcn.run", name: "emailcn" },
  { href: "https://mcpcn.dev", name: "mcpcn" },
] as const satisfies readonly SiteNavLink[];

export const SITE_TEMPLATES = [
  { href: "https://startercn.vercel.app", name: "startercn" },
] as const satisfies readonly SiteNavLink[];

export const SITE_SKILLS = [
  {
    href: "https://skills.sh/shadcn-labs/skills/launch-shadcn-registry",
    name: "launch-shadcn-registry",
  },
  {
    href: "https://skills.sh/shadcn-labs/skills/tailwind-to-stylex",
    name: "tailwind-to-stylex",
  },
  {
    href: "https://skills.sh/shadcn-labs/skills/mastra-file-agents",
    name: "mastra-file-agents",
  },
] as const satisfies readonly SiteNavLink[];

export const SITE_NAV_SECTIONS = [
  { id: "registries", items: SITE_REGISTRIES, title: "Registries" },
  { id: "templates", items: SITE_TEMPLATES, title: "Templates" },
  { id: "skills", items: SITE_SKILLS, title: "Skills" },
] as const;
