"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb29Orb } from "@/components/orbs/orb-29/meta";

export { meta, orb29Orb } from "@/components/orbs/orb-29/meta";

export type Orb29Props = Omit<ShaderOrbProps, "variant">;

export const Orb29 = ({ size = 280, ...rest }: Orb29Props) => (
  <ShaderOrb variant={orb29Orb} size={size} {...rest} />
);

export default Orb29;
