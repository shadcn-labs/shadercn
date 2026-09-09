"use client";

import { orb20Orb } from "@/components/orbs/orb-20/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb20Orb } from "@/components/orbs/orb-20/meta";

export type Orb20Props = Omit<ShaderOrbProps, "variant">;

export const Orb20 = ({ size = 280, ...rest }: Orb20Props) => (
  <ShaderOrb variant={orb20Orb} size={size} {...rest} />
);

export default Orb20;
