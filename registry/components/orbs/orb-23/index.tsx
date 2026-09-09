"use client";

import { orb23Orb } from "@/components/orbs/orb-23/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb23Orb } from "@/components/orbs/orb-23/meta";

export type Orb23Props = Omit<ShaderOrbProps, "variant">;

export const Orb23 = ({ size = 280, ...rest }: Orb23Props) => (
  <ShaderOrb variant={orb23Orb} size={size} {...rest} />
);

export default Orb23;
