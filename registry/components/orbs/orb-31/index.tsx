"use client";

import { orb31Orb } from "@/components/orbs/orb-31/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb31Orb } from "@/components/orbs/orb-31/meta";

export type Orb31Props = Omit<ShaderOrbProps, "variant">;

export const Orb31 = ({ size = 280, ...rest }: Orb31Props) => (
  <ShaderOrb variant={orb31Orb} size={size} {...rest} />
);

export default Orb31;
