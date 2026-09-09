"use client";

import { orb11Orb } from "@/components/orbs/orb-11/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb11Orb } from "@/components/orbs/orb-11/meta";

export type Orb11Props = Omit<ShaderOrbProps, "variant">;

export const Orb11 = ({ size = 280, ...rest }: Orb11Props) => (
  <ShaderOrb variant={orb11Orb} size={size} {...rest} />
);

export default Orb11;
