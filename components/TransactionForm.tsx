"use client";

import { useActionState, useState } from "react";
import { saveTransaction } from "@/app/actions";

type Member = { id: number; name: string };
export type Initial = {
  id?: number;
  kind: "expense" | "repayment";
  description: string;
  amount: string;
  paid_by: number;
  share_pct: number;
  occurred_on: string;
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
    <form action={action} className="card stack">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="row">
        <label>
          Type
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as Initial["kind"])}>
            <option value="expense">Dépense</option>
            <option value="repayment">Remboursement</option>
          </select>
        </label>
        <label>
          Date
          <input name="occurred_on" type="date" required defaultValue={initial.occurred_on} />
        </label>
      </div>
      <label>
        Description
        <input name="description" required maxLength={200} defaultValue={initial.description} />
      </label>
      <div className="row">
        <label>
          Montant ($)
          <input name="amount" inputMode="decimal" required defaultValue={initial.amount} placeholder="0,00" />
        </label>
        <label>
          {kind === "repayment" ? "Qui rembourse ?" : "Payé par"}
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
          <span className="muted">50 = partage égal, 100 = avance complète, 0 = dépense personnelle.</span>
        </label>
      )}
      {state?.error && <p className="error">{state.error}</p>}
      <button disabled={pending}>{submitLabel}</button>
    </form>
  );
}
