"use client";

import { DownloadIcon, SquareDashedIcon, TypeIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback } from "react";
import { toast } from "sonner";

import { LogoMark, getLogoMarkSVG, getLogoTypeSVG } from "@/components/logo";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export const BrandContextMenu = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { resolvedTheme } = useTheme();
  const { copyToClipboard } = useCopyToClipboard();

  const color = resolvedTheme === "light" ? "#000" : "#fff";
  const logoMarkSvgString = getLogoMarkSVG(color);
  const logoTypeSvgString = getLogoTypeSVG(color);

  const handleCopyLogomark = useCallback(() => {
    copyToClipboard(logoMarkSvgString);
    toast.success("Logomark copied as SVG");
  }, [logoMarkSvgString, copyToClipboard]);

  const handleCopyLogotype = useCallback(() => {
    copyToClipboard(logoTypeSvgString);
    toast.success("Logotype copied as SVG");
  }, [logoTypeSvgString, copyToClipboard]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={handleCopyLogomark}>
          <LogoMark />
          Copy logomark as SVG
        </ContextMenuItem>

        <ContextMenuItem onClick={handleCopyLogotype}>
          <TypeIcon />
          Copy logotype as SVG
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem asChild>
          <a
            href="https://shadcn-labs.com/brand"
            target="_blank"
            rel="noopener noreferrer"
          >
            <SquareDashedIcon />
            Brand guidelines
          </a>
        </ContextMenuItem>

        <ContextMenuItem asChild>
          <a
            href="https://shadcn-labs.com/shadcn-labs-brand.zip"
            target="_blank"
            rel="noopener noreferrer"
          >
            <DownloadIcon />
            Download brand assets
          </a>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
