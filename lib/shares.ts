/** Répartition d'une transaction entre les participants d'un compte (à deux ou en groupe). */

export type Share = { user_id: number; share_cents: number };

export type ShareInput = {
  kind: "expense" | "repayment" | "opening";
  amountCents: number;
  payerId: number;
  memberIds: number[];
  /** Compte à deux : part due par l'autre personne, en %. */
  otherPct: number;
  /** Compte de groupe : part de chaque participant (payeur compris), en %. */
  pcts: Record<number, number>;
  /** Remboursement ou solde de départ dans un groupe : la personne concernée. */
  counterpart: number | null;
};

/** Parts dues par chaque participant (hors payeur), ou un message d'erreur lisible. */
export function computeShares(i: ShareInput): { error: string } | { shares: Share[] } {
  const others = i.memberIds.filter((id) => id !== i.payerId);
  if (!i.memberIds.includes(i.payerId)) return { error: "Payeur invalide." };
  if (others.length === 0) return { error: "Il faut au moins deux participants." };

  if (i.kind !== "expense") {
    // Remboursement / solde de départ : une seule contrepartie qui doit 100 % du montant
    const target = others.length === 1 ? others[0] : i.counterpart;
    if (target === null || !others.includes(target))
      return { error: i.kind === "repayment" ? "Choisissez la personne remboursée." : "Choisissez la personne qui doit cet argent." };
    return { shares: [{ user_id: target, share_cents: i.amountCents }] };
  }

  if (others.length === 1) {
    if (!Number.isInteger(i.otherPct) || i.otherPct < 0 || i.otherPct > 100)
      return { error: "La part de l'autre doit être un entier entre 0 et 100 %." };
    const cents = Math.round((i.amountCents * i.otherPct) / 100);
    return { shares: cents > 0 ? [{ user_id: others[0], share_cents: cents }] : [] };
  }

  // Groupe : chaque participant a un pourcentage entier ; le total doit faire 100 %
  let total = 0;
  for (const id of i.memberIds) {
    const p = i.pcts[id];
    if (!Number.isInteger(p) || p < 0 || p > 100) return { error: "Chaque pourcentage doit être un entier entre 0 et 100." };
    total += p;
  }
  if (total !== 100) return { error: `Les pourcentages doivent totaliser 100 % (actuellement ${total} %).` };
  const shares = others
    .map((id) => ({ user_id: id, share_cents: Math.round((i.amountCents * i.pcts[id]) / 100) }))
    .filter((s) => s.share_cents > 0);
  // Arrondis : les parts des autres ne peuvent jamais dépasser le montant payé
  let sum = shares.reduce((s, x) => s + x.share_cents, 0);
  for (let k = shares.length - 1; sum > i.amountCents && k >= 0; k--) {
    const cut = Math.min(shares[k].share_cents, sum - i.amountCents);
    shares[k].share_cents -= cut;
    sum -= cut;
  }
  return { shares: shares.filter((s) => s.share_cents > 0) };
}

/** Pourcentage de chaque participant, déduit des parts enregistrées (pour préremplir le formulaire). */
export function sharesToPcts(amountCents: number, payerId: number, memberIds: number[], shares: Share[]): Record<number, number> {
  const out: Record<number, number> = {};
  let others = 0;
  for (const id of memberIds) {
    if (id === payerId) continue;
    const s = shares.find((x) => x.user_id === id)?.share_cents ?? 0;
    out[id] = amountCents > 0 ? Math.round((s / amountCents) * 100) : 0;
    others += out[id];
  }
  out[payerId] = Math.max(0, 100 - others);
  return out;
}
