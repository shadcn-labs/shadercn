"use client";

import { orb17Orb } from "@/components/orbs/orb-17/meta";
import type { ShaderOrbProps } from "@/components/orbs/orbkit-core-wgpu";
import { ShaderOrb } from "@/components/orbs/orbkit-core-wgpu";

/*
 * Ported from orbkit (GLSL) to TypeGPU for shadercn.
 * Original: https://github.com/zzzzshawn/orbkit
 */

export { meta, orb17Orb } from "@/components/orbs/orb-17/meta";

export type Orb17Props = Omit<ShaderOrbProps, "variant">;

export const Orb17 = ({ size = 280, ...rest }: Orb17Props) => (
  <ShaderOrb variant={orb17Orb} size={size} {...rest} />
);

export default Orb17;
