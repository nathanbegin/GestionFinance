"use client";

import { useActionState, useState } from "react";
import { saveTransaction } from "@/app/actions";
import FilePicker from "./FilePicker";

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
};

export default function TransactionForm({
  members,
  initial,
  submitLabel,
}: {
  members: Member[];
  initial: Initial;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(saveTransaction, undefined);
  const [kind, setKind] = useState(initial.kind);

  return (
    <form action={action} className="card stack" encType="multipart/form-data">
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
          <select name="paid_by" defaultValue={initial.paid_by}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {kind === "expense" && (
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
      <FilePicker />
      {state?.error && <p className="error">{state.error}</p>}
      <button disabled={pending}>{submitLabel}</button>
    </form>
  );
}
