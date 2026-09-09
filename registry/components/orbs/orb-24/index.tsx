"use client";

import { orb24Orb } from "@/components/orbs/orb-24/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb24Orb } from "@/components/orbs/orb-24/meta";

export type Orb24Props = Omit<ShaderOrbProps, "variant">;

export const Orb24 = ({ size = 280, ...rest }: Orb24Props) => (
  <ShaderOrb variant={orb24Orb} size={size} {...rest} />
);

export default Orb24;
