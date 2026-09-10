"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb03Orb } from "@/components/orbs/orb-03/meta";

export { meta, orb03Orb } from "@/components/orbs/orb-03/meta";

export type Orb03Props = Omit<ShaderOrbProps, "variant">;

export const Orb03 = ({ size = 280, ...rest }: Orb03Props) => (
  <ShaderOrb variant={orb03Orb} size={size} {...rest} />
);

export default Orb03;
