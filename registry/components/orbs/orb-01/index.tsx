"use client";

import { orb01Orb } from "@/components/orbs/orb-01/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb01Orb } from "@/components/orbs/orb-01/meta";

export type Orb01Props = Omit<ShaderOrbProps, "variant">;

export const Orb01 = ({ size = 280, ...rest }: Orb01Props) => (
  <ShaderOrb variant={orb01Orb} size={size} {...rest} />
);

export default Orb01;
