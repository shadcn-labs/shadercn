"use client";

import { orb02Orb } from "@/components/orbs/orb-02/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb02Orb } from "@/components/orbs/orb-02/meta";

export type Orb02Props = Omit<ShaderOrbProps, "variant">;

export const Orb02 = ({ size = 280, ...rest }: Orb02Props) => (
  <ShaderOrb variant={orb02Orb} size={size} {...rest} />
);

export default Orb02;
