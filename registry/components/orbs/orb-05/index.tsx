"use client";

import { orb05Orb } from "@/components/orbs/orb-05/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb05Orb } from "@/components/orbs/orb-05/meta";

export type Orb05Props = Omit<ShaderOrbProps, "variant">;

export const Orb05 = ({ size = 280, ...rest }: Orb05Props) => (
  <ShaderOrb variant={orb05Orb} size={size} {...rest} />
);

export default Orb05;
