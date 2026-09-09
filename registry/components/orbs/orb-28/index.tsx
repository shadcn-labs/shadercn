"use client";

import { orb28Orb } from "@/components/orbs/orb-28/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb28Orb } from "@/components/orbs/orb-28/meta";

export type Orb28Props = Omit<ShaderOrbProps, "variant">;

export const Orb28 = ({ size = 280, ...rest }: Orb28Props) => (
  <ShaderOrb variant={orb28Orb} size={size} {...rest} />
);

export default Orb28;
