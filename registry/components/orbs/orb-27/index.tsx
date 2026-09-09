"use client";

import { orb27Orb } from "@/components/orbs/orb-27/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb27Orb } from "@/components/orbs/orb-27/meta";

export type Orb27Props = Omit<ShaderOrbProps, "variant">;

export const Orb27 = ({ size = 280, ...rest }: Orb27Props) => (
  <ShaderOrb variant={orb27Orb} size={size} {...rest} />
);

export default Orb27;
