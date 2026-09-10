"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb19Orb } from "@/components/orbs/orb-19/meta";

export { meta, orb19Orb } from "@/components/orbs/orb-19/meta";

export type Orb19Props = Omit<ShaderOrbProps, "variant">;

export const Orb19 = ({ size = 280, ...rest }: Orb19Props) => (
  <ShaderOrb variant={orb19Orb} size={size} {...rest} />
);

export default Orb19;
