"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb33Orb } from "@/components/orbs/orb-33/meta";

export { meta, orb33Orb } from "@/components/orbs/orb-33/meta";

export type Orb33Props = Omit<ShaderOrbProps, "variant">;

export const Orb33 = ({ size = 280, ...rest }: Orb33Props) => (
  <ShaderOrb variant={orb33Orb} size={size} {...rest} />
);

export default Orb33;
