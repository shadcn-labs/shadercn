"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb25Orb } from "@/components/orbs/orb-25/meta";

export { meta, orb25Orb } from "@/components/orbs/orb-25/meta";

export type Orb25Props = Omit<ShaderOrbProps, "variant">;

export const Orb25 = ({ size = 280, ...rest }: Orb25Props) => (
  <ShaderOrb variant={orb25Orb} size={size} {...rest} />
);

export default Orb25;
