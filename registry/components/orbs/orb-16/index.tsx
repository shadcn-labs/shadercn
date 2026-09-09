"use client";

import { orb16Orb } from "@/components/orbs/orb-16/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb16Orb } from "@/components/orbs/orb-16/meta";

export type Orb16Props = Omit<ShaderOrbProps, "variant">;

export const Orb16 = ({ size = 280, ...rest }: Orb16Props) => (
  <ShaderOrb variant={orb16Orb} size={size} {...rest} />
);

export default Orb16;
