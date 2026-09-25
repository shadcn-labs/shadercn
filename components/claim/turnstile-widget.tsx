"use client";

import Script from "next/script";
import { useCallback, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const TurnstileWidget = ({
  action = "claim",
  onToken,
  onExpire,
}: {
  action?: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
}) => {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!siteKey || widgetId.current !== null) {
      return;
    }
    const container = containerRef.current;
    const api = window.turnstile;
    if (!container || !api) {
      return;
    }
    widgetId.current = api.render(container, {
      action,
      callback: onToken,
      "error-callback": onExpire,
      "expired-callback": onExpire,
      sitekey: siteKey,
    });
  }, [action, onExpire, onToken, siteKey]);

  if (!siteKey) {
    return (
      <p className="text-destructive text-sm" role="alert">
        Bot protection is not configured (missing
        NEXT_PUBLIC_TURNSTILE_SITE_KEY).
      </p>
    );
  }

  return (
    <>
      <Script
        src={SCRIPT_SRC}
        strategy="afterInteractive"
        onReady={renderWidget}
      />
      <div ref={containerRef} />
    </>
  );
};

export const resetTurnstile = () => {
  try {
    window.turnstile?.reset();
  } catch {
    // ignore reset failures; the next render issues a fresh challenge
  }
};
