"use client";

import { Moon, Sun } from "lucide-react";

import { useMounted } from "@/hooks/use-mounted";
import { useThemeToggle } from "@/hooks/use-theme-toggle";
import { cn } from "@/lib/utils";

const THEME_OPTIONS = [
  { icon: Sun, label: "light", value: "light" },
  { icon: Moon, label: "dark", value: "dark" },
] as const;

export const ModeSwitcher = () => {
  const { toggleTheme } = useThemeToggle();
  const isMounted = useMounted();

  if (!isMounted) {
    return <div className="flex h-8 w-20" />;
  }

  return (
    <div
      className="inline-flex items-center rounded-full bg-background inset-ring-1 inset-ring-border"
      role="radiogroup"
      aria-label="Theme"
    >
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;

        return (
          <button
            key={option.label}
            type="button"
            className={cn(
              "relative flex size-8 items-center justify-center rounded-full text-muted-foreground transition-[color,box-shadow] hover:text-foreground data-[active=true]:text-foreground data-[active=true]:inset-ring-1 data-[active=true]:inset-ring-border [&_svg]:size-4"
            )}
            role="radio"
            aria-label={`${option.label} mode`}
            onClick={toggleTheme}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
};
