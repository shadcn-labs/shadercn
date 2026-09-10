"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb17Orb } from "@/components/orbs/orb-17/meta";

export { meta, orb17Orb } from "@/components/orbs/orb-17/meta";

export type Orb17Props = Omit<ShaderOrbProps, "variant">;

export const Orb17 = ({ size = 280, ...rest }: Orb17Props) => (
  <ShaderOrb variant={orb17Orb} size={size} {...rest} />
);

export default Orb17;
