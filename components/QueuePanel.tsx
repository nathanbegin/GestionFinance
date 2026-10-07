"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { deleteItem, flushQueue, listItems, putItem, QUEUE_EVENT, type QueueItem } from "@/lib/offlineQueue";

const KIND: Record<string, string> = { expense: "Dépense", repayment: "Remboursement", opening: "Solde de départ" };

/** Liste d'attente : transactions saisies sur cet appareil et pas encore reçues par le serveur. */
export default function QueuePanel({ userId }: { userId: number }) {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await listItems(userId));
    } catch {
      setItems([]);
    }
  }, [userId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener(QUEUE_EVENT, refresh);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener(QUEUE_EVENT, refresh);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [refresh]);

  async function syncNow() {
    setMessage(null);
    if (!navigator.onLine) {
      setMessage("Pas de connexion pour le moment : la synchronisation reprendra automatiquement au retour du réseau.");
      return;
    }
    setBusy(true);
    try {
      // les éléments en erreur sont aussi réessayés quand on appuie sur le bouton
      for (const it of items ?? []) if (it.status === "error") await putItem({ ...it, status: "pending", error: undefined });
      const r = await flushQueue(userId);
      if (r.synced > 0) router.refresh();
      setMessage(
        r.synced > 0
          ? `${r.synced} transaction${r.synced > 1 ? "s" : ""} envoyée${r.synced > 1 ? "s" : ""} ✓`
          : r.retry
            ? "Le serveur n'est pas joignable pour l'instant : nouvel essai automatique bientôt."
            : r.failed > 0
              ? "Certaines transactions ont été refusées (voir le détail ci-dessous)."
              : "Rien à envoyer.",
      );
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function remove(it: QueueItem) {
    if (!confirm(`Supprimer « ${it.fields.description || KIND[it.fields.kind]} » de la liste d'attente ? Elle ne sera jamais envoyée.`)) return;
    await deleteItem(it.id);
  }

  if (items === null) return <p className="muted">Chargement…</p>;

  return (
    <div className="stack">
      <div className="card stack">
        <div className="split-total">
          <strong>{online ? "🟢 En ligne" : "📴 Hors ligne"}</strong>
          <span className="muted">
            {items.length === 0 ? "Tout est synchronisé" : `${items.length} en attente`}
          </span>
        </div>
        <button onClick={syncNow} disabled={busy || items.length === 0}>
          {busy ? "Synchronisation…" : "🔄 Synchroniser maintenant"}
        </button>
        {message && <p className="muted" style={{ margin: 0 }}>{message}</p>}
      </div>

      {items.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Aucune transaction en attente. Les transactions saisies sans connexion apparaîtront ici jusqu&apos;à leur envoi.
          </p>
        </div>
      ) : (
        <div className="card">
          {items.map((it) => (
            <div className="tx" key={it.id}>
              <div className="tx-main">
                <div className="tx-title">
                  {it.fields.description || KIND[it.fields.kind]}
                  <span className="badge">{KIND[it.fields.kind] ?? it.fields.kind}</span>
                  <span className="badge">{it.status === "error" ? "⚠️ Refusée" : "⏳ En attente"}</span>
                </div>
                <div className="muted">
                  {it.fields.occurred_on} · {it.ledgerLabel} · saisie le {new Date(it.createdAt).toLocaleString("fr-CA")}
                  {it.uploads.length + it.files.length > 0 && ` · ${it.uploads.length + it.files.length} pièce(s) jointe(s)`}
                </div>
                {it.status === "error" && <p className="error" style={{ marginTop: 4 }}>{it.error}</p>}
              </div>
              <div className="right">
                <strong>{it.fields.amount} $</strong>
                <div className="actions">
                  <button className="link danger" onClick={() => remove(it)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted">
        Ces transactions sont enregistrées uniquement sur cet appareil jusqu&apos;à leur envoi. N&apos;effacez pas les données du
        navigateur et ne désinstallez pas l&apos;application avant la synchronisation.
      </p>
    </div>
  );
}
