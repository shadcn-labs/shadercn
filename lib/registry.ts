import path from "node:path";

import { readFileFromRoot } from "@/lib/read-file";

/** Docs titles stay `components/orbs/*`; sources live under `registry/`. */
export const resolveDocsSourcePath = (relativePath: string): string => {
  if (relativePath.startsWith("components/orbs/")) {
    return path.join("registry", relativePath);
  }

  return relativePath;
};

export const readOptionalFromRoot = async (
  relativePath: string
): Promise<string | null> => {
  try {
    return await readFileFromRoot(resolveDocsSourcePath(relativePath));
  } catch {
    return null;
  }
};

export const getRegistryUiSourceCandidates = ({ name }: { name: string }) => [
  path.join("registry", "components", "orbs", name, "index.tsx"),
  path.join("registry", "components", "orbs", `${name}.tsx`),
  path.join("registry", "new-york", `${name}.tsx`),
];

export const getDemoSource = (name: string): Promise<string | null> =>
  readOptionalFromRoot(path.join("examples", `${name}.tsx`));

export const getRegistrySource = async (
  name: string
): Promise<string | null> => {
  const candidates = getRegistryUiSourceCandidates({ name });

  for (const candidate of candidates) {
    const code = await readOptionalFromRoot(candidate);
    if (code) {
      return code;
    }
  }

  return null;
};
