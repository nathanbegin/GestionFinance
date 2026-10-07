"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { saveTransaction } from "@/app/actions";
import { addItem, deleteItem, flushQueue, listItems, newId, type QueueItem } from "@/lib/offlineQueue";
import type { Supplier } from "@/lib/suppliers";
import { matchSuppliers } from "@/lib/supplierMatch";
import FilePicker, { type PickerItem } from "./FilePicker";
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

type Props = {
  members: Member[];
  initial: Initial;
  submitLabel: string;
  ledgerId: number;
  suppliers: Supplier[];
  /** Utilisateur et compte courants : nécessaires pour la file d'attente hors ligne. */
  userId: number;
  ledgerLabel: string;
};

/**
 * Nouvelle transaction : enregistrée d'abord sur l'appareil puis envoyée (immédiatement si la connexion le permet),
 * pour ne jamais perdre une saisie. Modification : action serveur habituelle (connexion requise).
 */
export default function TransactionForm(props: Props) {
  const [nonce, setNonce] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      {notice && (
        <div className="card notice" role="status">
          ✓ {notice} <Link href="/attente">Voir la liste d&apos;attente</Link>
        </div>
      )}
      <FormInner
        key={nonce}
        {...props}
        onQueued={(msg) => {
          setNotice(msg);
          setNonce((n) => n + 1);
          window.scrollTo({ top: 0 });
        }}
      />
    </>
  );
}

function FormInner({
  members,
  initial,
  submitLabel,
  ledgerId,
  suppliers,
  userId,
  ledgerLabel,
  onQueued,
}: Props & { onQueued: (message: string) => void }) {
  const router = useRouter();
  const isNew = !initial.id;
  const [items, setItems] = useState<PickerItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!isNew) return; // modification : action serveur habituelle
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "");
    const pctsOut: Record<number, string> = {};
    for (const m of members) pctsOut[m.id] = get(`pct_${m.id}`);
    const item: QueueItem = {
      id: newId(),
      userId,
      ledgerId,
      ledgerLabel,
      createdAt: Date.now(),
      fields: {
        kind: get("kind"),
        description: get("description"),
        amount: get("amount"),
        paid_by: Number(get("paid_by")),
        occurred_on: get("occurred_on"),
        share_pct: get("share_pct"),
        pcts: pctsOut,
        counterpart: Number(get("counterpart")) || null,
        invoice_number: get("invoice_number"),
        suppliers: fd.getAll("suppliers").map(Number),
      },
      uploads: items.filter((i) => i.pathname).map((i) => ({ pathname: i.pathname!, name: i.name })),
      files: items.filter((i) => i.file).map((i) => i.file!),
      status: "pending",
      attempts: 0,
    };
    setLocalError(null);
    setSaving(true);
    try {
      await addItem(item);
    } catch {
      setLocalError("Impossible d'enregistrer sur l'appareil (stockage indisponible).");
      setSaving(false);
      return;
    }
    if (navigator.onLine) {
      await flushQueue(userId, item.id);
      const left = (await listItems(userId)).find((i) => i.id === item.id);
      if (!left) {
        router.push("/"); // envoyée : retour à l'accueil
        router.refresh();
        return;
      }
      if (left.status === "error") {
        // refusée par le serveur (champ invalide…) : on la retire de la file et on laisse corriger le formulaire
        await deleteItem(item.id);
        setLocalError(left.error ?? "Transaction refusée.");
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    onQueued(
      navigator.onLine
        ? "Enregistrée sur l'appareil ; l'envoi sera réessayé automatiquement."
        : "Enregistrée sur l'appareil ; elle sera envoyée dès que la connexion reviendra.",
    );
  }

  return (
    <form action={action} onSubmit={onSubmit} className="card stack">
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
      <FilePicker ledgerId={ledgerId} onBusy={setUploading} onItems={setItems} allowLocal={isNew} />
      {(localError ?? state?.error) && <p className="error">{localError ?? state?.error}</p>}
      <button disabled={pending || uploading || saving}>{uploading ? "Envoi des fichiers…" : saving ? "Enregistrement…" : submitLabel}</button>
    </form>
  );
}
