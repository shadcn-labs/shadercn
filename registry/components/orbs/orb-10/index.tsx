"use client";

import { orb10Orb } from "@/components/orbs/orb-10/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb10Orb } from "@/components/orbs/orb-10/meta";

export type Orb10Props = Omit<ShaderOrbProps, "variant">;

export const Orb10 = ({ size = 280, ...rest }: Orb10Props) => (
  <ShaderOrb variant={orb10Orb} size={size} {...rest} />
);

export default Orb10;
