/** The one address shape used everywhere, and its two renderings. Pure, safe for client components. */
export type Address = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

export function addressLines(a: Address | null | undefined): string[] {
  if (!a) return [];
  const cityLine = [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : "");
  return [a.line1, a.line2, cityLine, a.country].filter((l): l is string => !!l && l.trim().length > 0);
}

/** "77 Grand Ave · Los Angeles, CA 90013" — the dossier's one-line form. */
export function addressInline(a: Address | null | undefined): string {
  if (!a) return "";
  const cityLine = [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : "");
  return [a.line1, cityLine].filter((l) => l && l.trim().length > 0).join(" · ");
}
