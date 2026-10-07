"use client";

import { useActionState, useState } from "react";
import { createAccount } from "@/app/actions";

type Person = { id: number; name: string; hint: string };

export default function CreateAccountForm({ people }: { people: Person[] }) {
  const [state, action, pending] = useActionState(createAccount, undefined);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  function toggle(id: number, on: boolean) {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  }

  return (
    <form action={action} className="card stack">
      <strong>Créer un compte de dépenses</strong>
      <label>
        Nom du compte <span className="muted">(facultatif)</span>
        <input name="name" maxLength={60} placeholder="ex. : Colocation, Voyage en France…" />
      </label>
      <fieldset className="supplier-picks" style={{ flexDirection: "column", flexWrap: "nowrap" }}>
        <legend>Avec qui ?</legend>
        {people.length === 0 && <span className="muted">Aucune autre personne n&apos;est encore inscrite au service.</span>}
        <div className="people-list">
          {people.map((p) => (
            <label className="chip" key={p.id}>
              <input type="checkbox" name="members" value={p.id} checked={picked.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />
              <span className="who">{p.name}</span>
              <span className="muted">{p.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="muted" style={{ margin: 0 }}>
        {picked.size === 0 && "Cochez une personne pour un compte à deux, ou plusieurs pour un compte de groupe."}
        {picked.size === 1 && "Compte à deux : chaque dépense indique la part due par l'autre personne."}
        {picked.size > 1 && `Compte de groupe (${picked.size + 1} personnes) : chaque dépense est répartie en pourcentages entre les participants.`}
      </p>
      {state?.error && <p className="error">{state.error}</p>}
      <button disabled={pending || picked.size === 0}>Créer le compte</button>
    </form>
  );
}
