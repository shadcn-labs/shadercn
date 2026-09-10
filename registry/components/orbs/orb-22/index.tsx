"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb22Orb } from "@/components/orbs/orb-22/meta";

export { meta, orb22Orb } from "@/components/orbs/orb-22/meta";

export type Orb22Props = Omit<ShaderOrbProps, "variant">;

export const Orb22 = ({ size = 280, ...rest }: Orb22Props) => (
  <ShaderOrb variant={orb22Orb} size={size} {...rest} />
);

export default Orb22;
