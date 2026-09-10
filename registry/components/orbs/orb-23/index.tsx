"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb23Orb } from "@/components/orbs/orb-23/meta";

export { meta, orb23Orb } from "@/components/orbs/orb-23/meta";

export type Orb23Props = Omit<ShaderOrbProps, "variant">;

export const Orb23 = ({ size = 280, ...rest }: Orb23Props) => (
  <ShaderOrb variant={orb23Orb} size={size} {...rest} />
);

export default Orb23;
