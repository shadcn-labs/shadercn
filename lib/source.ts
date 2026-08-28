import type { InferPageType } from "fumadocs-core/source";
import { loader } from "fumadocs-core/source";

import { docs } from "@/.source/server";
import { ROUTES } from "@/constants/routes";
import { SITE } from "@/constants/site";
import { AGENT_DOCS_DIRECTIVE_MARKDOWN } from "@/lib/agent-discovery/directive";
import { docsContentRoute } from "@/lib/docs";

export const source = loader({
  baseUrl: ROUTES.DOCS,
  source: docs.toFumadocsSource(),
});

export const getPageImage = () => ({
  segments: [],
  url: SITE.OG_IMAGE,
});

export const getPageMarkdownUrl = (page: InferPageType<typeof source>) => {
  const segments = [...page.slugs, "content.md"];

  return {
    segments,
    url: `${docsContentRoute}/${segments.join("/")}`,
  };
};

export const getLLMText = async (page: InferPageType<typeof source>) => {
  const processed = await page.data.getText("processed");

  const sections = [
    page.data.description,
    AGENT_DOCS_DIRECTIVE_MARKDOWN,
    processed,
  ].filter(Boolean);

  return `# ${page.data.title}

${sections.join("\n\n")}`;
};
