"use client";

import { orb18Orb } from "@/components/orbs/orb-18/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb18Orb } from "@/components/orbs/orb-18/meta";

export type Orb18Props = Omit<ShaderOrbProps, "variant">;

export const Orb18 = ({ size = 280, ...rest }: Orb18Props) => (
  <ShaderOrb variant={orb18Orb} size={size} {...rest} />
);

export default Orb18;
