import type { Metadata } from "next";
import Link from "next/link";

import { ClaimedOrb } from "@/components/claim/claimed-orb";
import { ShareOrb } from "@/components/claim/share-orb";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { SITE } from "@/constants/site";
import { parseClaimedConfig } from "@/lib/claims/apply-config";
import { canonicalizeUsername, validateUsername } from "@/lib/claims/usernames";
import { createPageMetadata } from "@/seo/metadata";

export const dynamic = "force-dynamic";

interface PublicClaim {
  username: string;
  variant_slug: string;
  config: unknown;
  verified_at: string | null;
}

const workerBase = () =>
  (process.env.CLAIMS_WORKER_URL ?? "").replace(/\/$/, "");

const fetchPublicClaim = async (
  canonical: string
): Promise<PublicClaim | null> => {
  const base = workerBase();
  // Local dev without a Worker URL can't serve claims; show not-found guidance.
  if (!base) {
    return null;
  }
  try {
    const response = await fetch(
      `${base}/api/claims/${encodeURIComponent(canonical)}`,
      {
        cache: "no-store",
      }
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as PublicClaim & { ok?: boolean };
    if (!data || data.username !== canonical) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ handle?: string }>;
}): Promise<Metadata> => {
  const { handle } = await params;
  const raw = typeof handle === "string" ? handle : "";
  const path = `/${raw}`;
  if (!raw.startsWith("@")) {
    return createPageMetadata({ noIndex: true, path, title: "Not found" });
  }
  const canonical = canonicalizeUsername(raw.slice(1));
  return createPageMetadata({
    description: `The one-of-one shadercn orb claimed by @${canonical}.`,
    noIndex: true,
    path,
    title: `@${canonical}`,
  });
};

const ProfilePage = async ({
  params,
}: {
  params: Promise<{ handle?: string }>;
}) => {
  const { handle } = await params;
  const raw = typeof handle === "string" ? handle : "";
  const isHandle = raw.startsWith("@");
  const canonical = isHandle ? canonicalizeUsername(raw.slice(1)) : "";
  const valid = isHandle && validateUsername(canonical).ok;
  const claim = valid ? await fetchPublicClaim(canonical) : null;
  const config = claim ? parseClaimedConfig(claim.config) : null;

  if (!valid || !claim || !config) {
    return (
      <PageTransition>
        <div className="container-wrapper px-6">
          <div className="container max-w-md py-16 text-center">
            <h1 className="text-2xl font-semibold">No orb here yet</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {valid
                ? `@${canonical} isn't claimed, or its reservation expired.`
                : "That isn't a valid orb handle."}{" "}
              Usernames are claimed through a 15-minute email link.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild sound="click">
                <Link href={ROUTES.CLAIM}>Claim your orb</Link>
              </Button>
              <Button asChild variant="outline" sound="click">
                <Link href={ROUTES.PLAYGROUND}>Open playground</Link>
              </Button>
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  const publicUrl = `${SITE.URL}/@${canonical}`;

  return (
    <PageTransition>
      <div className="container-wrapper px-6">
        <div className="container flex flex-col items-center py-10 text-center lg:py-14">
          <div className="border-border bg-background overflow-hidden rounded-xl border">
            <ClaimedOrb config={config} size={420} />
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            @{claim.username}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            One-of-one shadercn orb · {claim.variant_slug}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <ShareOrb url={publicUrl} />
            <Button asChild variant="outline" size="sm" sound="click">
              <Link href={ROUTES.DOCS_COMPONENTS}>Component catalog</Link>
            </Button>
            <Button asChild variant="outline" size="sm" sound="click">
              <Link href={ROUTES.PLAYGROUND}>Playground</Link>
            </Button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default ProfilePage;
