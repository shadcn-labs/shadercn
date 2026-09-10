import type { Metadata } from "next";

import { OrbPlayground } from "@/components/orb-playground";
import type { OrbState } from "@/components/orbs/canvas";
import { PageTransition } from "@/components/page-transition";
import { ROUTES } from "@/constants/routes";
// `lib/orbs` is a client module (every orb is `"use client"`), so the route
// validates its query against the plain slug/state lists instead.
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
      <section className="container-wrapper relative">
        <div className="container flex flex-col gap-6 py-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Playground
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm">
              Every orb runs its own WebGPU shader. Author a state, then copy
              the JSX with only the values you changed.
            </p>
          </div>

          <OrbPlayground
            initialSlug={slug}
            initialState={initialState as OrbState}
          />
        </div>
      </section>
    </PageTransition>
  );
};

export default PlaygroundPage;
