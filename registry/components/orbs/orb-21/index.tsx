"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb21Orb } from "@/components/orbs/orb-21/meta";

export { meta, orb21Orb } from "@/components/orbs/orb-21/meta";

export type Orb21Props = Omit<ShaderOrbProps, "variant">;

export const Orb21 = ({ size = 280, ...rest }: Orb21Props) => (
  <ShaderOrb variant={orb21Orb} size={size} {...rest} />
);

export default Orb21;
