"use client";

import { orb12Orb } from "@/components/orbs/orb-12/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb12Orb } from "@/components/orbs/orb-12/meta";

export type Orb12Props = Omit<ShaderOrbProps, "variant">;

export const Orb12 = ({ size = 280, ...rest }: Orb12Props) => (
  <ShaderOrb variant={orb12Orb} size={size} {...rest} />
);

export default Orb12;
