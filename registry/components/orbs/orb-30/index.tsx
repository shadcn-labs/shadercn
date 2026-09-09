"use client";

import { orb30Orb } from "@/components/orbs/orb-30/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb30Orb } from "@/components/orbs/orb-30/meta";

export type Orb30Props = Omit<ShaderOrbProps, "variant">;

export const Orb30 = ({ size = 280, ...rest }: Orb30Props) => (
  <ShaderOrb variant={orb30Orb} size={size} {...rest} />
);

export default Orb30;
