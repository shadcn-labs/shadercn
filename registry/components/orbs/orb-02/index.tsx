"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb02Orb } from "@/components/orbs/orb-02/meta";

export { meta, orb02Orb } from "@/components/orbs/orb-02/meta";

export type Orb02Props = Omit<ShaderOrbProps, "variant">;

export const Orb02 = ({ size = 280, ...rest }: Orb02Props) => (
  <ShaderOrb variant={orb02Orb} size={size} {...rest} />
);

export default Orb02;
