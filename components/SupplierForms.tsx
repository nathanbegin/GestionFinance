"use client";

import { useActionState } from "react";
import { addSupplier, deleteSupplier, updateSupplier } from "@/app/actions";
import type { Supplier } from "@/lib/suppliers";
import LogoInput from "./LogoInput";
import SupplierLogo from "./SupplierLogo";

export function AddSupplierForm() {
  const [state, action, pending] = useActionState(addSupplier, undefined);
  return (
    <form action={action} className="card stack">
      <strong>Ajouter un fournisseur</strong>
      <div className="row">
        <label>
          Nom
          <input name="name" required maxLength={60} placeholder="ex. : Hydro-Québec" />
        </label>
        <label className="color-field">
          Couleur (sans logo)
          <input name="color" type="color" defaultValue="#2459d6" />
        </label>
      </div>
      <label>
        Logo <span className="muted">(facultatif : PNG, JPEG ou WebP)</span>
        <LogoInput />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="ok">{state.ok}</p>}
      <button disabled={pending}>Ajouter</button>
    </form>
  );
}

function EditSupplierForm({ s }: { s: Supplier }) {
  const [state, action, pending] = useActionState(updateSupplier, undefined);
  return (
    <form action={action} className="stack" style={{ marginTop: 12 }}>
      <input type="hidden" name="id" value={s.id} />
      <div className="row">
        <label>
          Nom
          <input name="name" required maxLength={60} defaultValue={s.name} />
        </label>
        <label className="color-field">
          Couleur
          <input name="color" type="color" defaultValue={s.color} />
        </label>
      </div>
      <label>
        Nouveau logo <span className="muted">(remplace l&apos;actuel)</span>
        <LogoInput />
      </label>
      {s.has_logo && (
        <label className="check">
          <input type="checkbox" name="remove_logo" /> Retirer le logo (revenir à la pastille de couleur)
        </label>
      )}
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="ok">{state.ok}</p>}
      <button disabled={pending}>Enregistrer</button>
    </form>
  );
}

export function SupplierList({ suppliers }: { suppliers: Supplier[] }) {
  if (!suppliers.length) return <p className="muted">Aucun fournisseur pour l&apos;instant.</p>;
  return (
    <div className="card">
      {suppliers.map((s) => (
        <details className="supplier-row" key={s.id}>
          <summary>
            <SupplierLogo s={s} size={36} />
            <span className="supplier-name">{s.name}</span>
            <span className="muted">Modifier</span>
          </summary>
          <EditSupplierForm s={s} />
          <form
            action={deleteSupplier}
            onSubmit={(e) => {
              if (!confirm(`Supprimer « ${s.name} » ? Il disparaîtra des transactions.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={s.id} />
            <button className="link danger" style={{ marginTop: 8 }}>
              Supprimer ce fournisseur
            </button>
          </form>
        </details>
      ))}
    </div>
  );
}
