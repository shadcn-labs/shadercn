import type { Metadata } from "next";

import { OrbPlayground } from "@/components/orb-playground";
import type { OrbState } from "@/components/orbs/canvas";
import { PageTransition } from "@/components/page-transition";
import { ROUTES } from "@/constants/routes";
import { ORB_SLUGS, ORB_STATE_VALUES } from "@/lib/orb-slugs";
import { createPageMetadata } from "@/seo/metadata";

export const metadata: Metadata = createPageMetadata({
  description:
    "Dial in a shadercn orb: pick a shader, author its idle, thinking, and speaking states, and copy the JSX.",
  path: ROUTES.PLAYGROUND,
  title: "Playground",
});

const PlaygroundPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ orb?: string; state?: string }>;
}) => {
  const { orb, state } = await searchParams;
  const slug = ORB_SLUGS.find((value) => value === orb) ?? ORB_SLUGS[0];
  const initialState =
    ORB_STATE_VALUES.find((value) => value === state) ?? "idle";

  return (
    <PageTransition>
      <div className="container-wrapper 3xl:fixed:px-0 px-6">
        <div className="3xl:fixed:container h-[calc(100svh-var(--header-height))] pb-4">
          <OrbPlayground
            initialSlug={slug}
            initialState={initialState as OrbState}
          />
        </div>
      </div>
    </PageTransition>
  );
};

export default PlaygroundPage;
