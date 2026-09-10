"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb28Orb } from "@/components/orbs/orb-28/meta";

export { meta, orb28Orb } from "@/components/orbs/orb-28/meta";

export type Orb28Props = Omit<ShaderOrbProps, "variant">;

export const Orb28 = ({ size = 280, ...rest }: Orb28Props) => (
  <ShaderOrb variant={orb28Orb} size={size} {...rest} />
);

export default Orb28;
