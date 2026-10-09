import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/layout/wordmark";

/** Header for the signed-out pages: wordmark left, two exits right. */
export function PublicNav({ showStatusLink = true }: { showStatusLink?: boolean }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-rule px-4 sm:px-8 lg:px-16">
      <Wordmark />
      <nav className="flex items-center gap-4 text-xs uppercase tracking-label text-ink-2 sm:gap-7">
        {showStatusLink ? (
          <Link href="/status" className="hidden transition-colors hover:text-ink sm:inline">
            Check a repair
          </Link>
        ) : null}
        <ButtonLink href="/sign-in" variant="secondary" size="sm" className="normal-case tracking-normal">
          Team sign in
        </ButtonLink>
      </nav>
    </header>
  );
}
