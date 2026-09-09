"use client";

import { orb15Orb } from "@/components/orbs/orb-15/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb15Orb } from "@/components/orbs/orb-15/meta";

export type Orb15Props = Omit<ShaderOrbProps, "variant">;

export const Orb15 = ({ size = 280, ...rest }: Orb15Props) => (
  <ShaderOrb variant={orb15Orb} size={size} {...rest} />
);

export default Orb15;
