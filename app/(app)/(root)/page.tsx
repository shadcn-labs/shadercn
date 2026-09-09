import { CommandBox } from "@/components/command-box";
import { HomeCtas } from "@/components/home-ctas";
import { HomeOrbShowcase } from "@/components/home-orb-showcase";
import { PageTransition } from "@/components/page-transition";
import { ROUTES } from "@/constants/routes";
import { BreadcrumbJsonLd } from "@/seo/json-ld";

export const dynamic = "force-static";
export const revalidate = false;

export default function IndexPage() {
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "Home", path: ROUTES.HOME }]} />
      <PageTransition>
        <section className="container-wrapper relative">
          <div className="container flex flex-col items-center gap-4 py-16 text-center md:py-20 lg:py-24">
            <h1 className="max-w-7xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl from-foreground via-foreground to-foreground/65 bg-linear-to-b bg-clip-text text-transparent">
              shadercn
            </h1>

            <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
              GPU-powered shader components for React.
              <br className="hidden sm:block" />
              Built on{" "}
              <a
                href={ROUTES.VGPU_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 decoration-muted-foreground/40 hover:decoration-foreground/70 transition-colors"
              >
                vgpu
              </a>
              . Distributed via shadcn.
            </p>

            <CommandBox className="mt-4 w-full max-w-xl" />

            <HomeCtas className="mt-4" />

            <HomeOrbShowcase className="mt-10 max-w-4xl" />
          </div>
        </section>
      </PageTransition>
    </>
  );
}
