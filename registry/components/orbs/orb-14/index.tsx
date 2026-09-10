"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb14Orb } from "@/components/orbs/orb-14/meta";

export { meta, orb14Orb } from "@/components/orbs/orb-14/meta";

export type Orb14Props = Omit<ShaderOrbProps, "variant">;

export const Orb14 = ({ size = 280, ...rest }: Orb14Props) => (
  <ShaderOrb variant={orb14Orb} size={size} {...rest} />
);

export default Orb14;
