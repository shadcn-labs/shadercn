"use client";

import { orb13Orb } from "@/components/orbs/orb-13/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb13Orb } from "@/components/orbs/orb-13/meta";

export type Orb13Props = Omit<ShaderOrbProps, "variant">;

export const Orb13 = ({ size = 280, ...rest }: Orb13Props) => (
  <ShaderOrb variant={orb13Orb} size={size} {...rest} />
);

export default Orb13;
