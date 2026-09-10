"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb12Orb } from "@/components/orbs/orb-12/meta";

export { meta, orb12Orb } from "@/components/orbs/orb-12/meta";

export type Orb12Props = Omit<ShaderOrbProps, "variant">;

export const Orb12 = ({ size = 280, ...rest }: Orb12Props) => (
  <ShaderOrb variant={orb12Orb} size={size} {...rest} />
);

export default Orb12;
