"use client";

import { orb22Orb } from "@/components/orbs/orb-22/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb22Orb } from "@/components/orbs/orb-22/meta";

export type Orb22Props = Omit<ShaderOrbProps, "variant">;

export const Orb22 = ({ size = 280, ...rest }: Orb22Props) => (
  <ShaderOrb variant={orb22Orb} size={size} {...rest} />
);

export default Orb22;
