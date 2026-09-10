"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb11Orb } from "@/components/orbs/orb-11/meta";

export { meta, orb11Orb } from "@/components/orbs/orb-11/meta";

export type Orb11Props = Omit<ShaderOrbProps, "variant">;

export const Orb11 = ({ size = 280, ...rest }: Orb11Props) => (
  <ShaderOrb variant={orb11Orb} size={size} {...rest} />
);

export default Orb11;
