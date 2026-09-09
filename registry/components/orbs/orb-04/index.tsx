"use client";

import { orb04Orb } from "@/components/orbs/orb-04/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb04Orb } from "@/components/orbs/orb-04/meta";

export type Orb04Props = Omit<ShaderOrbProps, "variant">;

export const Orb04 = ({ size = 280, ...rest }: Orb04Props) => (
  <ShaderOrb variant={orb04Orb} size={size} {...rest} />
);

export default Orb04;
