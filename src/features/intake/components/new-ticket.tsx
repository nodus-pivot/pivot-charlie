"use client";

import { useState } from "react";
import type { CatalogWatch } from "../sheet";
import { EMPTY_DRAFT, TicketForm, type Draft } from "./ticket-form";

/** S2 body: a blank draft and the shared form in by-hand mode. */
export function NewTicketForm({ catalog, brandId }: { catalog: CatalogWatch[]; brandId: string }) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  return (
    <div className="flex flex-col">
      <TicketForm draft={draft} onPatch={(p) => setDraft((d) => ({ ...d, ...p }))} catalog={catalog} brandId={brandId} context={{ kind: "hand" }} />
    </div>
  );
}
