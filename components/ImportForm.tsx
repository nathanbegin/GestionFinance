"use client";

import { useActionState } from "react";
import { importTransactions } from "@/app/actions";

export default function ImportForm() {
  const [state, action, pending] = useActionState(importTransactions, undefined);
  return (
    <form action={action} className="card stack">
      <label>
        Fichier Excel (.xlsx)
        <input name="file" type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.details && (
        <ul className="errors">
          {state.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {state?.ok && <p className="ok">{state.ok}</p>}
      <button disabled={pending}>{pending ? "Importation…" : "Importer"}</button>
    </form>
  );
}
