"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb18Orb } from "@/components/orbs/orb-18/meta";

export { meta, orb18Orb } from "@/components/orbs/orb-18/meta";

export type Orb18Props = Omit<ShaderOrbProps, "variant">;

export const Orb18 = ({ size = 280, ...rest }: Orb18Props) => (
  <ShaderOrb variant={orb18Orb} size={size} {...rest} />
);

export default Orb18;
