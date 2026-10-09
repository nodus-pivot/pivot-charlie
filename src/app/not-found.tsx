import { PublicNav } from "@/components/layout/public-nav";
import { ButtonLink } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicNav />
      <main className="flex flex-1 flex-col justify-center px-4 py-16 sm:px-8 lg:px-16">
        <div className="flex max-w-[520px] flex-col gap-7">
          <Eyebrow>Not here</Eyebrow>
          <h1 className="font-display text-[44px] leading-none font-semibold tracking-[-0.02em] text-ink sm:text-[56px]">
            Nothing on the bench at this address.
          </h1>
          <p className="text-lg leading-[1.55] text-ink-2">
            The page may have moved, or it is not built yet.
          </p>
          <div>
            <ButtonLink href="/" variant="primary">
              Back to the start
            </ButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}
