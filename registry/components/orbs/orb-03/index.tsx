"use client";

import { orb03Orb } from "@/components/orbs/orb-03/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb03Orb } from "@/components/orbs/orb-03/meta";

export type Orb03Props = Omit<ShaderOrbProps, "variant">;

export const Orb03 = ({ size = 280, ...rest }: Orb03Props) => (
  <ShaderOrb variant={orb03Orb} size={size} {...rest} />
);

export default Orb03;
