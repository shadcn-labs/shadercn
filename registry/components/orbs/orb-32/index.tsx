"use client";

import { orb32Orb } from "@/components/orbs/orb-32/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb32Orb } from "@/components/orbs/orb-32/meta";

export type Orb32Props = Omit<ShaderOrbProps, "variant">;

export const Orb32 = ({ size = 280, ...rest }: Orb32Props) => (
  <ShaderOrb variant={orb32Orb} size={size} {...rest} />
);

export default Orb32;
