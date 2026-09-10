"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb31Orb } from "@/components/orbs/orb-31/meta";

export { meta, orb31Orb } from "@/components/orbs/orb-31/meta";

export type Orb31Props = Omit<ShaderOrbProps, "variant">;

export const Orb31 = ({ size = 280, ...rest }: Orb31Props) => (
  <ShaderOrb variant={orb31Orb} size={size} {...rest} />
);

export default Orb31;
