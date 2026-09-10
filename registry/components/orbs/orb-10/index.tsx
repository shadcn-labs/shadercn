"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb10Orb } from "@/components/orbs/orb-10/meta";

export { meta, orb10Orb } from "@/components/orbs/orb-10/meta";

export type Orb10Props = Omit<ShaderOrbProps, "variant">;

export const Orb10 = ({ size = 280, ...rest }: Orb10Props) => (
  <ShaderOrb variant={orb10Orb} size={size} {...rest} />
);

export default Orb10;
