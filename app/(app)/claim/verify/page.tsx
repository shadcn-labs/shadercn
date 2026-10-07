import type { Metadata } from "next";
import { Suspense } from "react";

import { VerifyState } from "@/components/claim/verify-state";
import { PageTransition } from "@/components/page-transition";
import { ROUTES } from "@/constants/routes";
import { createPageMetadata } from "@/seo/metadata";

export const metadata: Metadata = createPageMetadata({
  description: "Verify your shadercn orb claim.",
  noIndex: true,
  path: ROUTES.CLAIM_VERIFY,
  title: "Verify claim",
});

const VerifyPage = () => (
  <PageTransition>
    <div className="container-wrapper px-6">
      <div className="container py-10">
        <Suspense fallback={<p className="py-10 text-center">Verifying…</p>}>
          <VerifyState />
        </Suspense>
      </div>
    </div>
  </PageTransition>
);

export default VerifyPage;
