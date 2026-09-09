"use client";

import { orb21Orb } from "@/components/orbs/orb-21/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb21Orb } from "@/components/orbs/orb-21/meta";

export type Orb21Props = Omit<ShaderOrbProps, "variant">;

export const Orb21 = ({ size = 280, ...rest }: Orb21Props) => (
  <ShaderOrb variant={orb21Orb} size={size} {...rest} />
);

export default Orb21;
