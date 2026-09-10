import { CommandBox } from "@/components/command-box";
import { HomeCtas } from "@/components/home-ctas";
import { HomeShowcase } from "@/components/home-showcase";
import { PageHero } from "@/components/page-hero";
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
            <PageHero
              description={
                <>
                  WebGPU/WGSL shader components for React.
                  <br className="hidden sm:block" />
                  Built on vgpu and TypeGPU. Distributed via shadcn.
                </>
              }
              descriptionClassName="max-w-2xl text-lg sm:text-xl"
              title="Beautiful shaders, made simple"
              titleClassName="max-w-7xl"
            />

            <CommandBox className="mt-4 w-full max-w-xl" />

            <HomeCtas className="mt-4" />
          </div>
        </section>

        <section className="container-wrapper pb-8 lg:pb-12">
          <div className="container">
            <HomeShowcase />
          </div>
        </section>
      </PageTransition>
    </>
  );
}
