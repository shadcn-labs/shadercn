"use client";

import type { ShaderOrbProps } from "@/components/orbs/canvas";
import { ShaderOrb } from "@/components/orbs/canvas";
import { orb26Orb } from "@/components/orbs/orb-26/meta";

export { meta, orb26Orb } from "@/components/orbs/orb-26/meta";

export type Orb26Props = Omit<ShaderOrbProps, "variant">;

export const Orb26 = ({ size = 280, ...rest }: Orb26Props) => (
  <ShaderOrb variant={orb26Orb} size={size} {...rest} />
);

export default Orb26;
