import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/layout/wordmark";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { getCurrentUser } from "@/features/auth/queries";
import { AFTER_SIGN_IN_PATH } from "@/features/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

/** P3: a 560px column over the photo band. No self-signup. */
export default async function SignInPage() {
  if (await getCurrentUser()) redirect(AFTER_SIGN_IN_PATH);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-panel" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(90deg, rgba(14,26,38,.98) 0%, rgba(14,26,38,.9) 44%, rgba(14,26,38,.3))" }}
      />

      <div className="relative flex min-h-dvh w-full max-w-[560px] flex-col px-4 py-8 sm:px-8 sm:py-14 lg:px-16">
        <Wordmark />

        <div className="my-auto flex flex-col gap-7 py-12">
          <Eyebrow>Team access</Eyebrow>
          <h1 className="font-display text-[48px] leading-none font-semibold tracking-[-0.02em] text-ink sm:text-[56px]">
            Sign in
          </h1>
          <p className="text-[15px] leading-[1.55] text-ink-2">
            No self-signup. An owner or admin creates your account under Ops &rsaquo; Users and hands you a
            temporary password.
          </p>
          <SignInForm />
        </div>

        <p className="text-[13px] text-ink-3">
          Checking on a repair?{" "}
          <Link href="/status" className="text-gold-light hover:text-gold">
            Look up your ticket
          </Link>
        </p>
      </div>
    </div>
  );
}
