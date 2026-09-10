"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb06Orb } from "@/components/orbs/orb-06/meta";

export { meta, orb06Orb } from "@/components/orbs/orb-06/meta";

export type Orb06Props = Omit<ShaderOrbProps, "variant">;

export const Orb06 = ({ size = 280, ...rest }: Orb06Props) => (
  <ShaderOrb variant={orb06Orb} size={size} {...rest} />
);

export default Orb06;
