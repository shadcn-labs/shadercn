"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb20Orb } from "@/components/orbs/orb-20/meta";

export { meta, orb20Orb } from "@/components/orbs/orb-20/meta";

export type Orb20Props = Omit<ShaderOrbProps, "variant">;

export const Orb20 = ({ size = 280, ...rest }: Orb20Props) => (
  <ShaderOrb variant={orb20Orb} size={size} {...rest} />
);

export default Orb20;
