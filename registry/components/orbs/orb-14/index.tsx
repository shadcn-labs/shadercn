"use client";

import { orb14Orb } from "@/components/orbs/orb-14/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb14Orb } from "@/components/orbs/orb-14/meta";

export type Orb14Props = Omit<ShaderOrbProps, "variant">;

export const Orb14 = ({ size = 280, ...rest }: Orb14Props) => (
  <ShaderOrb variant={orb14Orb} size={size} {...rest} />
);

export default Orb14;
