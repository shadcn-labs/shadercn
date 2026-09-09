"use client";

import { orb25Orb } from "@/components/orbs/orb-25/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb25Orb } from "@/components/orbs/orb-25/meta";

export type Orb25Props = Omit<ShaderOrbProps, "variant">;

export const Orb25 = ({ size = 280, ...rest }: Orb25Props) => (
  <ShaderOrb variant={orb25Orb} size={size} {...rest} />
);

export default Orb25;
