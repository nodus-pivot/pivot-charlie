import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { PublicNav } from "@/components/layout/public-nav";
import { ButtonLink } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";

const PILLARS = [
  { title: "Half the admin", body: "Automatic updates answer the “where is it” emails." },
  { title: "A record for every repair", body: "Every step, part and note, kept with the watch." },
  { title: "The brand stays yours", body: "Emails, timing and tone come from you." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicNav />

      <main className="relative flex flex-1 flex-col overflow-hidden">
        {/* Photo band: the slot is the panel color until real photography lands,
            then the image goes behind this overlay with the dark values falling away. */}
        <div aria-hidden className="absolute inset-0 bg-panel" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(14,26,38,.96) 38%, rgba(14,26,38,.35) 70%, rgba(14,26,38,.1))",
          }}
        />

        <section className="relative flex flex-1 flex-col justify-center px-4 py-16 sm:px-8 lg:px-16 lg:py-24">
          <div className="flex max-w-[520px] flex-col gap-7">
            <Eyebrow>Watch repair, kept</Eyebrow>
            <h1 className="font-display text-[44px] leading-none font-semibold tracking-[-0.02em] text-ink sm:text-[56px] lg:text-[64px]">
              One ledger for every watch that comes back to you.
            </h1>
            <p className="text-lg leading-[1.55] text-ink-2">
              Pivot follows a repair from the customer&rsquo;s first message to the day it ships home: intake,
              diagnosis, parts, bench, testing, return. Your name on every email.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="mailto:hello@pivot.test?subject=Pivot%20walkthrough" variant="primary">
                Get a walkthrough
              </ButtonLink>
              <span className="flex items-center gap-2 text-sm text-ink-2">
                Checking on a repair?
                <Link href="/status" className="inline-flex items-center gap-1 text-gold-light hover:text-gold">
                  Look it up <ArrowRight size={14} weight="regular" />
                </Link>
              </span>
            </div>
          </div>
        </section>

        <section className="relative mx-4 mb-10 grid gap-8 border-t border-border-strong pt-6 sm:mx-8 sm:grid-cols-3 sm:gap-12 lg:mx-16">
          {PILLARS.map((p) => (
            <div key={p.title} className="flex flex-col gap-1.5">
              <h2 className="font-display text-[26px] leading-tight font-semibold text-ink">{p.title}</h2>
              <p className="text-sm text-ink-2">{p.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
