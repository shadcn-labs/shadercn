"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb15Orb } from "@/components/orbs/orb-15/meta";

export { meta, orb15Orb } from "@/components/orbs/orb-15/meta";

export type Orb15Props = Omit<ShaderOrbProps, "variant">;

export const Orb15 = ({ size = 280, ...rest }: Orb15Props) => (
  <ShaderOrb variant={orb15Orb} size={size} {...rest} />
);

export default Orb15;
