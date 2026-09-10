"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb13Orb } from "@/components/orbs/orb-13/meta";

export { meta, orb13Orb } from "@/components/orbs/orb-13/meta";

export type Orb13Props = Omit<ShaderOrbProps, "variant">;

export const Orb13 = ({ size = 280, ...rest }: Orb13Props) => (
  <ShaderOrb variant={orb13Orb} size={size} {...rest} />
);

export default Orb13;
