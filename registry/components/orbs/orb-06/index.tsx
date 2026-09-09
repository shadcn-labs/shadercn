"use client";

import { orb06Orb } from "@/components/orbs/orb-06/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb06Orb } from "@/components/orbs/orb-06/meta";

export type Orb06Props = Omit<ShaderOrbProps, "variant">;

export const Orb06 = ({ size = 280, ...rest }: Orb06Props) => (
  <ShaderOrb variant={orb06Orb} size={size} {...rest} />
);

export default Orb06;
