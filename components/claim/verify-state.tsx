"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { verifyClaim } from "@/lib/claims/client";
import type { VerifyResult } from "@/lib/claims/client";

const RECOVERY: Record<string, { title: string; body: string }> = {
  already_used: {
    body: "This link was already used. Each link works once — if you just verified, your orb is live. Otherwise start a fresh claim.",
    title: "Link already used",
  },
  expired: {
    body: "This link expired (links last 15 minutes). Start again or resend a fresh link from the claim page.",
    title: "Link expired",
  },
  invalid: {
    body: "We couldn't find that claim. The link may be incomplete — request a fresh one.",
    title: "Link not recognized",
  },
  malformed: {
    body: "That link looks incomplete. Copy the full link from your email or request a new one.",
    title: "Link looks incomplete",
  },
  rate_limited: {
    body: "Too many attempts. Wait a minute, then try the link again.",
    title: "Slow down",
  },
  recovery: {
    body: "That address already owns a claimed orb. Check your inbox for a recovery note.",
    title: "Already claimed",
  },
  superseded: {
    body: "A newer link replaced this one. Open the latest email, or resend from the claim page.",
    title: "Link replaced",
  },
};

export const VerifyState = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<
    | { status: "verifying" }
    | { status: "ok"; username: string }
    | { status: "failed"; code: string }
  >({ status: "verifying" });

  useEffect(() => {
    if (!token) {
      setState({ code: "malformed", status: "failed" });
      return;
    }
    let cancelled = false;
    const run = async () => {
      const result: VerifyResult = await verifyClaim(token);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({ status: "ok", username: result.username });
        router.replace(`/@${result.username}`);
      } else {
        setState({ code: result.code, status: "failed" });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  if (state.status === "verifying") {
    return (
      <div role="status" aria-live="polite" className="py-10 text-center">
        <p className="text-lg font-medium">Verifying your claim…</p>
        <p className="text-muted-foreground mt-2 text-sm">
          This takes a moment. Your link works once.
        </p>
      </div>
    );
  }

  if (state.status === "ok") {
    return (
      <div className="py-10 text-center">
        <p className="text-lg font-medium">
          Verified — taking you to your orb…
        </p>
        <Button asChild className="mt-4" sound="click">
          <Link href={`/@${state.username}`}>Open @{state.username}</Link>
        </Button>
      </div>
    );
  }

  const copy = RECOVERY[state.code] ?? {
    body: "Something went wrong. Request a fresh link and try again.",
    title: "Couldn't verify",
  };

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <h1 className="text-2xl font-semibold">{copy.title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{copy.body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild sound="click">
          <Link href="/claim">Claim again</Link>
        </Button>
        <Button asChild variant="outline" sound="click">
          <Link href="/playground">Back to playground</Link>
        </Button>
      </div>
    </div>
  );
};
