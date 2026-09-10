"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb16Orb } from "@/components/orbs/orb-16/meta";

export { meta, orb16Orb } from "@/components/orbs/orb-16/meta";

export type Orb16Props = Omit<ShaderOrbProps, "variant">;

export const Orb16 = ({ size = 280, ...rest }: Orb16Props) => (
  <ShaderOrb variant={orb16Orb} size={size} {...rest} />
);

export default Orb16;
