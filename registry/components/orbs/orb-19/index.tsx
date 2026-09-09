"use client";

import { orb19Orb } from "@/components/orbs/orb-19/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb19Orb } from "@/components/orbs/orb-19/meta";

export type Orb19Props = Omit<ShaderOrbProps, "variant">;

export const Orb19 = ({ size = 280, ...rest }: Orb19Props) => (
  <ShaderOrb variant={orb19Orb} size={size} {...rest} />
);

export default Orb19;
