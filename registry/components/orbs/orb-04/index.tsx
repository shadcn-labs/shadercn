"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb04Orb } from "@/components/orbs/orb-04/meta";

export { meta, orb04Orb } from "@/components/orbs/orb-04/meta";

export type Orb04Props = Omit<ShaderOrbProps, "variant">;

export const Orb04 = ({ size = 280, ...rest }: Orb04Props) => (
  <ShaderOrb variant={orb04Orb} size={size} {...rest} />
);

export default Orb04;
