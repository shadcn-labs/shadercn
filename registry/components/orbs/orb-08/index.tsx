"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb08Orb } from "@/components/orbs/orb-08/meta";

export { meta, orb08Orb } from "@/components/orbs/orb-08/meta";

export type Orb08Props = Omit<ShaderOrbProps, "variant">;

export const Orb08 = ({ size = 280, ...rest }: Orb08Props) => (
  <ShaderOrb variant={orb08Orb} size={size} {...rest} />
);

export default Orb08;
