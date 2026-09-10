"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb27Orb } from "@/components/orbs/orb-27/meta";

export { meta, orb27Orb } from "@/components/orbs/orb-27/meta";

export type Orb27Props = Omit<ShaderOrbProps, "variant">;

export const Orb27 = ({ size = 280, ...rest }: Orb27Props) => (
  <ShaderOrb variant={orb27Orb} size={size} {...rest} />
);

export default Orb27;
