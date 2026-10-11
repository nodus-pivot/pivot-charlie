import { countryName, isCountryCode } from "@/lib/country";

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

/** "France" for FR, nothing for the US or blank, the raw text when unrecognised. */
export function countryLine(country: string | null | undefined): string {
  if (!country || country.toUpperCase() === "US") return "";
  return isCountryCode(country) ? countryName(country) : country;
}

export function isInternational(a: Address | null | undefined): boolean {
  return !!a?.country && a.country.toUpperCase() !== "US";
}

export function addressLines(a: Address | null | undefined): string[] {
  if (!a) return [];
  const cityLine = [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : "");
  return [a.line1, a.line2, cityLine, countryLine(a.country)].filter((l): l is string => !!l && l.trim().length > 0);
}

/** "77 Grand Ave · Los Angeles, CA 90013" — the dossier's one-line form. */
export function addressInline(a: Address | null | undefined): string {
  if (!a) return "";
  const cityLine = [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : "");
  return [a.line1, cityLine, countryLine(a.country)].filter((l) => l && l.trim().length > 0).join(" · ");
}
