"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb30Orb } from "@/components/orbs/orb-30/meta";

export { meta, orb30Orb } from "@/components/orbs/orb-30/meta";

export type Orb30Props = Omit<ShaderOrbProps, "variant">;

export const Orb30 = ({ size = 280, ...rest }: Orb30Props) => (
  <ShaderOrb variant={orb30Orb} size={size} {...rest} />
);

export default Orb30;
