"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb07Orb } from "@/components/orbs/orb-07/meta";

export { meta, orb07Orb } from "@/components/orbs/orb-07/meta";

export type Orb07Props = Omit<ShaderOrbProps, "variant">;

export const Orb07 = ({ size = 280, ...rest }: Orb07Props) => (
  <ShaderOrb variant={orb07Orb} size={size} {...rest} />
);

export default Orb07;
