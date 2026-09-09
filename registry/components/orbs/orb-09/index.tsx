"use client";

import { orb09Orb } from "@/components/orbs/orb-09/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb09Orb } from "@/components/orbs/orb-09/meta";

export type Orb09Props = Omit<ShaderOrbProps, "variant">;

export const Orb09 = ({ size = 280, ...rest }: Orb09Props) => (
  <ShaderOrb variant={orb09Orb} size={size} {...rest} />
);

export default Orb09;
