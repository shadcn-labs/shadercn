"use client";

import { orb08Orb } from "@/components/orbs/orb-08/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb08Orb } from "@/components/orbs/orb-08/meta";

export type Orb08Props = Omit<ShaderOrbProps, "variant">;

export const Orb08 = ({ size = 280, ...rest }: Orb08Props) => (
  <ShaderOrb variant={orb08Orb} size={size} {...rest} />
);

export default Orb08;
