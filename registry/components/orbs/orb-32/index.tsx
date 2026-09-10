"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb32Orb } from "@/components/orbs/orb-32/meta";

export { meta, orb32Orb } from "@/components/orbs/orb-32/meta";

export type Orb32Props = Omit<ShaderOrbProps, "variant">;

export const Orb32 = ({ size = 280, ...rest }: Orb32Props) => (
  <ShaderOrb variant={orb32Orb} size={size} {...rest} />
);

export default Orb32;
