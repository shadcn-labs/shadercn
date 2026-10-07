import type { Metadata } from "next";

import { ClaimFlow } from "@/components/claim/claim-flow";
import { PageTransition } from "@/components/page-transition";
import { ROUTES } from "@/constants/routes";
import { createPageMetadata } from "@/seo/metadata";

export const metadata: Metadata = createPageMetadata({
  description:
    "Claim your shadercn username and receive a deterministic one-of-one orb at /@username.",
  path: ROUTES.CLAIM,
  title: "Claim your orb",
});

const ClaimPage = () => (
  <PageTransition>
    <div className="container-wrapper px-6">
      <div className="container py-10 lg:py-14">
        <ClaimFlow />
      </div>
    </div>
  </PageTransition>
);

export default ClaimPage;
