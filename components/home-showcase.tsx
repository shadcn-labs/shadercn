"use client";

import { Check, SearchIcon, Terminal } from "lucide-react";
import { useMemo, useState } from "react";

import { OrbPreview } from "@/components/orb-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { ORB_SLUGS } from "@/lib/orb-slugs";
import { ORBS } from "@/lib/orbs";
import { cn } from "@/lib/utils";

export const HomeShowcase = ({ className }: { className?: string }) => {
  const [slug, setSlug] = useState(ORB_SLUGS[0] as string);
  const [query, setQuery] = useState("");
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const installCommand = `npx shadcn@latest add @shadercn/${slug}`;

  const filteredOrbs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return ORB_SLUGS.map((s) => ({
        description: ORBS[s].variant.note ?? "",
        label: ORBS[s].variant.label,
        slug: s,
      }));
    }
    return ORB_SLUGS.filter((s) => {
      const orb = ORBS[s];
      return (
        orb.variant.label.toLowerCase().includes(term) ||
        (orb.variant.note ?? "").toLowerCase().includes(term)
      );
    }).map((s) => ({
      description: ORBS[s].variant.note ?? "",
      label: ORBS[s].variant.label,
      slug: s,
    }));
  }, [query]);

  return (
    <div
      className={cn(
        "bg-card overflow-hidden rounded-xl border text-left shadow-sm",
        className
      )}
    >
      <div className="border-b sm:grid sm:grid-cols-[16rem_1fr] sm:items-stretch sm:gap-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:hidden">
          <span className="text-sm font-medium">Choose orb</span>
          <Select value={slug} onValueChange={setSlug}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Choose component" />
            </SelectTrigger>
            <SelectContent>
              {filteredOrbs.map((item) => (
                <SelectItem key={item.slug} value={item.slug}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="hidden items-center px-4 py-3 sm:flex sm:border-r">
          <span className="text-sm font-semibold">Components</span>
        </div>
        <div className="hidden items-center justify-end px-4 py-3 sm:flex">
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(installCommand)}
          >
            {isCopied ? <Check /> : <Terminal />}
            <span className="min-w-0 truncate">{installCommand}</span>
          </Button>
        </div>
      </div>

      <div className="border-b px-4 py-3 sm:hidden">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => copyToClipboard(installCommand)}
        >
          {isCopied ? <Check /> : <Terminal />}
          <span className="min-w-0 truncate">{installCommand}</span>
        </Button>
      </div>

      <div className="grid sm:grid-cols-[16rem_1fr]">
        <aside className="hidden h-[60vh] flex-col border-b sm:flex sm:border-r sm:border-b-0">
          <div className="p-2.5">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 pr-16"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search orbs…"
                value={query}
              />
              {query && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {filteredOrbs.length} result
                  {filteredOrbs.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2.5">
            {filteredOrbs.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-2 py-1.5">
                <p className="text-sm text-muted-foreground">No orbs found.</p>
              </div>
            ) : (
              filteredOrbs.map((item) => (
                <button
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                    item.slug === slug
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/60"
                  )}
                  key={item.slug}
                  onClick={() => setSlug(item.slug)}
                  type="button"
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.description && (
                    <span className="text-muted-foreground line-clamp-1 text-xs">
                      {item.description}
                    </span>
                  )}
                </button>
              ))
            )}
          </nav>
        </aside>

        <div className="h-[60vh] overflow-hidden">
          <OrbPreview
            slug={slug}
            className="h-full min-h-0 border-0 rounded-none p-0"
          />
        </div>
      </div>
    </div>
  );
};
