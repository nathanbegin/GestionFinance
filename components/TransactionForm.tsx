"use client";

import { useActionState, useState } from "react";
import { saveTransaction } from "@/app/actions";
import type { Supplier } from "@/lib/suppliers";
import { matchSuppliers } from "@/lib/supplierMatch";
import FilePicker from "./FilePicker";
import SupplierLogo from "./SupplierLogo";

type Member = { id: number; name: string };
export type Initial = {
  id?: number;
  kind: "expense" | "repayment" | "opening";
  description: string;
  amount: string;
  paid_by: number;
  share_pct: number;
  occurred_on: string;
  invoice_number: string;
  supplier_ids: number[];
  /** Compte de groupe : part de chaque participant (payeur compris), en %. */
  pcts: Record<number, number>;
  /** Remboursement / solde de départ dans un groupe : la personne concernée. */
  counterpart: number | null;
};

export default function TransactionForm({
  members,
  initial,
  submitLabel,
  ledgerId,
  suppliers,
}: {
  members: Member[];
  initial: Initial;
  submitLabel: string;
  ledgerId: number;
  suppliers: Supplier[];
}) {
  const [state, action, pending] = useActionState(saveTransaction, undefined);
  const [kind, setKind] = useState(initial.kind);
  const [uploading, setUploading] = useState(false);
  const isGroup = members.length > 2;
  const [payer, setPayer] = useState(initial.paid_by);
  const [counterpart, setCounterpart] = useState<number | null>(initial.counterpart);
  // Pourcentages d'un compte de groupe (chaîne : permet un champ temporairement vide)
  const [pcts, setPcts] = useState<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    const hasSaved = Object.keys(initial.pcts).length > 0;
    members.forEach((m, i) => {
      out[m.id] = String(hasSaved ? (initial.pcts[m.id] ?? 0) : Math.floor(100 / members.length) + (i === 0 ? 100 % members.length : 0));
    });
    return out;
  });
  const pctTotal = members.reduce((sum, m) => sum + (Number(pcts[m.id]) || 0), 0);

  function splitEvenly() {
    const out: Record<number, string> = {};
    members.forEach((m, i) => (out[m.id] = String(Math.floor(100 / members.length) + (i === 0 ? 100 % members.length : 0))));
    setPcts(out);
  }
  // Fournisseurs cochés ; « dismissed » = ceux que l'utilisateur a décochés lui-même (on ne les recoche plus).
  const [picked, setPicked] = useState<Set<number>>(new Set(initial.supplier_ids));
  const [auto, setAuto] = useState<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  function suggest(text: string) {
    const ids = matchSuppliers(text, suppliers).filter((id) => !dismissed.has(id) && !picked.has(id));
    if (!ids.length) return;
    setPicked(new Set([...picked, ...ids]));
    setAuto(new Set([...auto, ...ids]));
  }

  function toggle(id: number, on: boolean) {
    const next = new Set(picked);
    const nextDismissed = new Set(dismissed);
    if (on) {
      next.add(id);
      nextDismissed.delete(id);
    } else {
      next.delete(id);
      nextDismissed.add(id);
    }
    setPicked(next);
    setDismissed(nextDismissed);
    setAuto(new Set([...auto].filter((a) => a !== id)));
  }

  return (
    <form action={action} className="card stack">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="row">
        <label>
          Type
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as Initial["kind"])}>
            <option value="expense">Dépense</option>
            <option value="repayment">Remboursement</option>
            <option value="opening">Solde de départ</option>
          </select>
        </label>
        <label>
          Date
          <input name="occurred_on" type="date" required defaultValue={initial.occurred_on} />
        </label>
      </div>
      <label>
        Description
        <input
          name="description"
          required={kind !== "opening"}
          maxLength={200}
          defaultValue={initial.description}
          onChange={(e) => suggest(e.target.value)}
          placeholder={kind === "opening" ? "Solde de départ" : undefined}
        />
      </label>
      <label>
        Numéro de facture <span className="muted">(facultatif)</span>
        <input name="invoice_number" maxLength={50} defaultValue={initial.invoice_number} />
      </label>
      <div className="row">
        <label>
          {kind === "opening" ? "Montant dû ($)" : "Montant ($)"}
          <input name="amount" inputMode="decimal" required defaultValue={initial.amount} placeholder="0,00" />
        </label>
        <label>
          {kind === "repayment" ? "Qui rembourse ?" : kind === "opening" ? "À qui doit-on cet argent ?" : "Payé par"}
          <select name="paid_by" value={payer} onChange={(e) => setPayer(Number(e.target.value))}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isGroup && kind !== "expense" && (
        <label>
          {kind === "repayment" ? "Remboursé à" : "Qui doit cet argent ?"}
          <select name="counterpart" required value={counterpart ?? ""} onChange={(e) => setCounterpart(Number(e.target.value) || null)}>
            <option value="">— Choisir —</option>
            {members
              .filter((m) => m.id !== payer)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {isGroup && kind === "expense" && (
        <fieldset className="split">
          <legend>Répartition de la dépense (%)</legend>
          {members.map((m) => (
            <label key={m.id} className="split-row">
              <span>
                {m.name}
                {m.id === payer && <span className="muted"> (a payé)</span>}
              </span>
              <input
                name={`pct_${m.id}`}
                type="number"
                min={0}
                max={100}
                step={1}
                required
                value={pcts[m.id]}
                onChange={(e) => setPcts({ ...pcts, [m.id]: e.target.value })}
              />
            </label>
          ))}
          <div className="split-total">
            <span className={pctTotal === 100 ? "ok" : "error"}>Total : {pctTotal} %{pctTotal === 100 ? " ✓" : " (doit faire 100 %)"}</span>
            <button type="button" className="link" onClick={splitEvenly}>
              Répartir également
            </button>
          </div>
          <span className="muted">Chaque participant autre que le payeur doit sa part au payeur.</span>
        </fieldset>
      )}
      {!isGroup && kind === "expense" && (
        <label>
          Part due par l&apos;autre personne (%)
          <input
            name="share_pct"
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={initial.share_pct}
          />
          <span className="muted">100 = l&apos;autre vous doit tout, 50 = partage égal, 0 = dépense personnelle. (Valeur par défaut modifiable dans Paramètres.)</span>
        </label>
      )}
      {kind === "opening" && (
        <p className="muted" style={{ margin: 0 }}>
          Solde déjà existant avant l&apos;utilisation de l&apos;application : la personne choisie ci-dessus est celle à qui l&apos;autre
          doit ce montant. Si chacun a un solde, ajoutez un solde de départ de chaque côté : ils se compensent.
        </p>
      )}
      <fieldset className="supplier-picks">
        <legend>Fournisseur(s) — le logo s&apos;affiche sur la transaction</legend>
        {suppliers.length === 0 && (
          <span className="muted">
            Aucun fournisseur : ajoutez-en dans <a href="/parametres">Paramètres</a>.
          </span>
        )}
        {suppliers.map((s) => (
          <label className="chip" key={s.id}>
            <input type="checkbox" name="suppliers" value={s.id} checked={picked.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
            <SupplierLogo s={s} size={22} />
            {s.name}
            {auto.has(s.id) && <span className="muted">suggéré</span>}
          </label>
        ))}
      </fieldset>
      <FilePicker ledgerId={ledgerId} onBusy={setUploading} />
      {state?.error && <p className="error">{state.error}</p>}
      <button disabled={pending || uploading}>{uploading ? "Envoi des fichiers…" : submitLabel}</button>
    </form>
  );
}
