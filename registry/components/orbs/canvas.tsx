"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import type {
  OrbColorValues,
  OrbDrive,
  OrbParamValues,
  OrbState,
  OrbVariant,
} from "@/components/orbs/renderer";
import { createOrbRenderer } from "@/components/orbs/renderer";

export type {
  OrbColorDef,
  OrbColorValues,
  OrbDrive,
  OrbParamDef,
  OrbParamValues,
  OrbState,
  OrbUniformStruct,
  OrbVariant,
} from "@/components/orbs/renderer";
export {
  defaultValuesFor,
  hexToRgb,
  ORB_STATES,
} from "@/components/orbs/renderer";

export interface ShaderOrbProps {
  variant: OrbVariant;
  state?: OrbState;
  size?: number;
  params?: OrbParamValues;
  colors?: OrbColorValues;
  statePresets?: Partial<Record<OrbState, Record<string, number>>>;
  stateColors?: Partial<Record<OrbState, Record<string, string>>>;
  stateVolumes?: Partial<Record<OrbState, { input?: number; output?: number }>>;
  volumes?: { input?: number; output?: number };
  paused?: boolean;
  pauseOffscreen?: boolean;
  maxDpr?: number;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

/**
 * Mounts one orb renderer on a canvas. Props feed a mutable drive object the frame
 * loop reads, so changing state, params, or colours never rebuilds the pipeline —
 * only `variant` and `maxDpr` do.
 */
export const ShaderOrb = ({
  variant,
  state = "idle",
  size,
  params,
  colors,
  statePresets,
  stateColors,
  stateVolumes,
  volumes,
  paused = false,
  pauseOffscreen = true,
  maxDpr = 2,
  className,
  style,
  ariaLabel,
}: ShaderOrbProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paintedKey, setPaintedKey] = useState<string | null>(null);
  const drive = useRef<OrbDrive>({ state });

  drive.current.state = state;
  drive.current.params = params;
  drive.current.colors = colors;
  drive.current.statePresets = statePresets;
  drive.current.stateColors = stateColors;
  drive.current.stateVolumes = stateVolumes;
  drive.current.volumes = volumes;
  drive.current.paused = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const renderer = createOrbRenderer({
      canvas,
      drive: () => drive.current,
      maxDpr,
      onFirstFrame: () => setPaintedKey(variant.key),
      pauseOffscreen,
      variant,
    });

    const start = async () => {
      try {
        await renderer.ready;
      } catch (error: unknown) {
        console.error(`[orbkit] ${variant.key} failed to start:`, error);
      }
    };
    void start();

    return renderer.dispose;
  }, [variant, maxDpr, pauseOffscreen]);

  return (
    <div
      className={className}
      style={{ height: size, position: "relative", width: size, ...style }}
    >
      <canvas
        aria-label={ariaLabel}
        ref={canvasRef}
        style={{
          display: "block",
          height: "100%",
          opacity: paintedKey === variant.key ? 1 : 0,
          transition: "opacity 0.3s ease",
          width: "100%",
        }}
      />
    </div>
  );
};

export default ShaderOrb;
