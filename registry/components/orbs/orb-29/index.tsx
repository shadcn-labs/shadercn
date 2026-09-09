"use client";

import { orb29Orb } from "@/components/orbs/orb-29/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb29Orb } from "@/components/orbs/orb-29/meta";

export type Orb29Props = Omit<ShaderOrbProps, "variant">;

export const Orb29 = ({ size = 280, ...rest }: Orb29Props) => (
  <ShaderOrb variant={orb29Orb} size={size} {...rest} />
);

export default Orb29;
