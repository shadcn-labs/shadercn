export const FALLBACK_SITE_ORIGIN = "https://shadercn.run" as const;

const getBaseUrl = () => {
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  return process.env.SITE_URL ?? FALLBACK_SITE_ORIGIN;
};

const baseUrl = getBaseUrl();

export const SITE = {
  AUTHOR: {
    NAME: "Aniket Pawar",
    TWITTER: "@alaymanguy",
  },
  DESCRIPTION: {
    LONG: "A collection of beautifully designed, accessible, and customizable shader components for React. Built on vgpu and TypeGPU. Works with shadcn/ui.",
    SHORT: "Beautiful shaders, made simple",
  },
  KEYWORDS: [
    "shadcn",
    "shadcn registry",
    "shader components",
    "gpu",
    "webgpu",
    "wgsl",
    "vgpu",
    "react",
    "npx shadcn add",
  ] as const,
  NAME: "shadercn",
  OG_IMAGE: `${baseUrl}/og.png`,
  REGISTRY: "@shadercn",
  URL: baseUrl,
};

export const META_THEME_COLORS = {
  dark: "#09090b",
  light: "#ffffff",
};

export const UTM_PARAMS = {
  utm_source: new URL(baseUrl).hostname,
};
