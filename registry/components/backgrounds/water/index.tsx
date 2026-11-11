"use client";

import type { ShaderBackgroundProps } from "@/components/backgrounds/canvas";
import { ShaderBackground } from "@/components/backgrounds/canvas";
import { waterBackground } from "@/components/backgrounds/water/meta";

export { meta, waterBackground } from "@/components/backgrounds/water/meta";

export type WaterBackgroundProps = Omit<ShaderBackgroundProps, "variant">;

export const WaterBackground = (props: WaterBackgroundProps) => (
  <ShaderBackground variant={waterBackground} {...props} />
);

export default WaterBackground;
