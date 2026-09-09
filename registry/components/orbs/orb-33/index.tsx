"use client";

import { orb33Orb } from "@/components/orbs/orb-33/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb33Orb } from "@/components/orbs/orb-33/meta";

export type Orb33Props = Omit<ShaderOrbProps, "variant">;

export const Orb33 = ({ size = 280, ...rest }: Orb33Props) => (
  <ShaderOrb variant={orb33Orb} size={size} {...rest} />
);

export default Orb33;
