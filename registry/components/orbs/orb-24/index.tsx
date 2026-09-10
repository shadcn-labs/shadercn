"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb24Orb } from "@/components/orbs/orb-24/meta";

export { meta, orb24Orb } from "@/components/orbs/orb-24/meta";

export type Orb24Props = Omit<ShaderOrbProps, "variant">;

export const Orb24 = ({ size = 280, ...rest }: Orb24Props) => (
  <ShaderOrb variant={orb24Orb} size={size} {...rest} />
);

export default Orb24;
