import { createRequire } from "node:module";

import { createMDX } from "fumadocs-mdx/next";
import { createJiti } from "jiti";

const require = createRequire(import.meta.url);
const jiti = createJiti(import.meta.url);

const { LINK } = await jiti.import("./constants/links");
const { ROUTES } = await jiti.import("./constants/routes");

const typegpuBabelLoader = {
  loader: require.resolve("babel-loader"),
  options: {
    plugins: [require.resolve("unplugin-typegpu/babel")],
    presets: [require.resolve("@babel/preset-typescript")],
  },
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  experimental: {
    turbopackUseBuiltinBabel: false,
  },
  headers() {
    const link = [
      `<${ROUTES.API_CATALOG}>; rel="api-catalog"`,
      `<${ROUTES.OPENAPI}>; rel="service-desc"`,
      `<${ROUTES.DOCS}>; rel="service-doc"`,
      `<${LINK.SHADCN_MCP_DOCS}>; rel="service-doc"; title="shadcn MCP server"`,
      `<${ROUTES.AGENT_SKILLS_INDEX}>; rel="describedby"`,
    ].join(", ");

    return [{ headers: [{ key: "Link", value: link }], source: ROUTES.HOME }];
  },
  images: {
    remotePatterns: [
      {
        hostname: "avatars.githubusercontent.com",
        protocol: "https",
      },
      {
        hostname: "images.unsplash.com",
        protocol: "https",
      },
    ],
  },
  outputFileTracingIncludes: {
    "/*": ["./registry/**/*"],
  },
  redirects() {
    return [
      {
        destination: `${ROUTES.DOCS}.md`,
        permanent: true,
        source: `${ROUTES.DOCS}.mdx`,
      },
      {
        destination: `${ROUTES.DOCS}/:path*.md`,
        permanent: true,
        source: `${ROUTES.DOCS}/:path*.mdx`,
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      "@/components/orbs": "./registry/components/orbs",
    },
    rules: {
      "**/orbs/**/gpu.ts": {
        as: "*.js",
        loaders: [typegpuBabelLoader],
      },
    },
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
