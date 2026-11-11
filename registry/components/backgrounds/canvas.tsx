"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import type {
  BackgroundColorValues,
  BackgroundDrive,
  BackgroundParamValues,
  BackgroundVariant,
} from "@/components/backgrounds/renderer";
import { createBackgroundRenderer } from "@/components/backgrounds/renderer";

export type {
  BackgroundColorDef,
  BackgroundColorValues,
  BackgroundDrive,
  BackgroundParamDef,
  BackgroundParamValues,
  BackgroundUniformStruct,
  BackgroundVariant,
} from "@/components/backgrounds/renderer";
export {
  defaultBackgroundValuesFor,
  hexToRgb,
} from "@/components/backgrounds/renderer";

export interface ShaderBackgroundProps {
  variant: BackgroundVariant;
  preset?: string;
  params?: BackgroundParamValues;
  colors?: BackgroundColorValues;
  paused?: boolean;
  pauseOffscreen?: boolean;
  maxDpr?: number;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

export const ShaderBackground = ({
  variant,
  preset,
  params,
  colors,
  paused,
  pauseOffscreen = true,
  maxDpr = 2,
  className,
  style,
  ariaLabel,
}: ShaderBackgroundProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paintedKey, setPaintedKey] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const drive = useRef<BackgroundDrive>({});

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  drive.current.preset = preset;
  drive.current.params = params;
  drive.current.colors = colors;
  drive.current.paused = paused ?? prefersReducedMotion;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const renderer = createBackgroundRenderer({
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
        console.error(`[shadercn] ${variant.key} failed to start:`, error);
      }
    };
    void start();

    return renderer.dispose;
  }, [variant, maxDpr, pauseOffscreen]);

  return (
    <div
      className={className}
      style={{
        height: "100%",
        overflow: "hidden",
        position: "relative",
        width: "100%",
        ...style,
      }}
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

export default ShaderBackground;
