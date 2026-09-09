"use client";

import { orb07Orb } from "@/components/orbs/orb-07/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb07Orb } from "@/components/orbs/orb-07/meta";

export type Orb07Props = Omit<ShaderOrbProps, "variant">;

export const Orb07 = ({ size = 280, ...rest }: Orb07Props) => (
  <ShaderOrb variant={orb07Orb} size={size} {...rest} />
);

export default Orb07;
