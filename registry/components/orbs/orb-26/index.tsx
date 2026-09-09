"use client";

import { orb26Orb } from "@/components/orbs/orb-26/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb26Orb } from "@/components/orbs/orb-26/meta";

export type Orb26Props = Omit<ShaderOrbProps, "variant">;

export const Orb26 = ({ size = 280, ...rest }: Orb26Props) => (
  <ShaderOrb variant={orb26Orb} size={size} {...rest} />
);

export default Orb26;
