"use client";

import type { ShaderBackgroundProps } from "@/components/backgrounds/canvas";
import { ShaderBackground } from "@/components/backgrounds/canvas";
import { warpBackground } from "@/components/backgrounds/warp/meta";

export { meta, warpBackground } from "@/components/backgrounds/warp/meta";

export type WarpBackgroundProps = Omit<ShaderBackgroundProps, "variant">;

export const WarpBackground = (props: WarpBackgroundProps) => (
  <ShaderBackground variant={warpBackground} {...props} />
);

export default WarpBackground;
