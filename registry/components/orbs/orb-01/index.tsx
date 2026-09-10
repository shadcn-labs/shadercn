"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb01Orb } from "@/components/orbs/orb-01/meta";

export { meta, orb01Orb } from "@/components/orbs/orb-01/meta";

export type Orb01Props = Omit<ShaderOrbProps, "variant">;

export const Orb01 = ({ size = 280, ...rest }: Orb01Props) => (
  <ShaderOrb variant={orb01Orb} size={size} {...rest} />
);

export default Orb01;
