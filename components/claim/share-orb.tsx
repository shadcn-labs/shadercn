"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export const ShareOrb = ({ url }: { url: string }) => {
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [shared, setShared] = useState(false);

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ url });
        setShared(true);
        window.setTimeout(() => setShared(false), 2000);
        return;
      } catch {
        // User dismissed or share failed — fall back to copy.
      }
    }
    await copyToClipboard(url);
  };

  return (
    <Button variant="outline" size="sm" sound="click" onClick={share}>
      {isCopied || shared ? "Copied!" : "Copy / share"}
    </Button>
  );
};
