"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb05Orb } from "@/components/orbs/orb-05/meta";

export { meta, orb05Orb } from "@/components/orbs/orb-05/meta";

export type Orb05Props = Omit<ShaderOrbProps, "variant">;

export const Orb05 = ({ size = 280, ...rest }: Orb05Props) => (
  <ShaderOrb variant={orb05Orb} size={size} {...rest} />
);

export default Orb05;
