"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb09Orb } from "@/components/orbs/orb-09/meta";

export { meta, orb09Orb } from "@/components/orbs/orb-09/meta";

export type Orb09Props = Omit<ShaderOrbProps, "variant">;

export const Orb09 = ({ size = 280, ...rest }: Orb09Props) => (
  <ShaderOrb variant={orb09Orb} size={size} {...rest} />
);

export default Orb09;
