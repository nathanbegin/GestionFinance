import { after } from "next/server";
import { q } from "./db";
import type { User } from "./auth";
import { getMembers, getTransaction } from "./ledger";
import { logAudit, type Snapshot } from "./audit";
import { formatMoney, parseAmount } from "./money";
import { computeShares, type Share } from "./shares";
import { insertAttachments, prepareUploads, type Prepared } from "./attachments";
import { listSuppliers } from "./suppliers";
import { notifyLedger } from "./push";

/** Champs d'une transaction, tels que reçus d'un formulaire ou de la file d'attente hors ligne. */
export type TxInput = {
  /** Modification d'une transaction existante (absent = nouvelle transaction). */
  id?: number;
  /** Identifiant généré par l'appareil : évite les doublons si la synchronisation est relancée. */
  clientId?: string | null;
  kind: string;
  description: string;
  amount: string;
  paid_by: number;
  occurred_on: string;
  share_pct?: string;
  pcts: Record<number, string>;
  counterpart?: number | null;
  invoice_number?: string;
  suppliers: number[];
  /** JSON : [{ pathname, name }] des fichiers déjà envoyés dans Vercel Blob. */
  uploads?: string;
};

export async function setShares(txId: number, shares: Share[]) {
  await q("DELETE FROM transaction_shares WHERE transaction_id = $1", [txId]);
  if (shares.length)
    await q(
      "INSERT INTO transaction_shares (transaction_id, user_id, share_cents) SELECT $1, u, s FROM unnest($2::int[], $3::int[]) AS t(u, s)",
      [txId, shares.map((x) => x.user_id), shares.map((x) => x.share_cents)],
    );
}

export async function setSuppliers(txId: number, ids: number[]) {
  await q("DELETE FROM transaction_suppliers WHERE transaction_id = $1", [txId]);
  if (ids.length)
    await q("INSERT INTO transaction_suppliers (transaction_id, supplier_id) SELECT $1, unnest($2::int[])", [txId, ids]);
}

async function attach(user: User, ledgerId: number, txId: number, description: string, items: Prepared[]) {
  await insertAttachments(ledgerId, txId, user.id, items);
  for (const a of items) await logAudit(ledgerId, user.id, "attachment.add", txId, { filename: a.filename, description });
}

/**
 * Crée ou modifie une transaction dans le compte `ledgerId` (l'utilisateur doit en être membre).
 * Utilisée par le formulaire (action serveur) et par la synchronisation hors ligne (/api/sync).
 */
export async function saveTransactionCore(
  user: User,
  ledgerId: number,
  input: TxInput,
): Promise<{ error: string } | { id: number; duplicate?: boolean }> {
  if (!user.ledgers.includes(ledgerId)) return { error: "Accès refusé à ce compte." };
  const members = await getMembers(ledgerId);
  if (members.length < 2) return { error: "Il faut au moins deux participants dans ce compte." };

  // Reprise d'une synchronisation déjà reçue : on ne recrée pas la transaction
  if (!input.id && input.clientId) {
    const dup = await q<{ id: number }>("SELECT id FROM transactions WHERE ledger_id = $1 AND client_id = $2", [
      ledgerId,
      input.clientId,
    ]);
    if (dup.length) return { id: dup[0].id, duplicate: true };
  }

  const kind = input.kind;
  const description = input.description.trim() || (kind === "opening" ? "Solde de départ" : "");
  const amount = parseAmount(String(input.amount ?? "").trim());
  const paidBy = Number(input.paid_by);
  const date = String(input.occurred_on ?? "").trim();
  const pct = Number(String(input.share_pct ?? "").trim() || String(user.default_share_pct));
  const invoice = (input.invoice_number ?? "").trim() || null;
  const pcts: Record<number, number> = {};
  for (const m of members) pcts[m.id] = Number(String(input.pcts?.[m.id] ?? "").trim() || "NaN");

  if (kind !== "expense" && kind !== "repayment" && kind !== "opening") return { error: "Type invalide." };
  if (!description || description.length > 200) return { error: "Description requise (200 caractères max)." };
  if (amount === null) return { error: "Montant invalide (ex. : 45,90)." };
  const payer = members.find((m) => m.id === paidBy);
  if (!payer) return { error: "Payeur invalide." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: "Date invalide." };
  if (invoice && invoice.length > 50) return { error: "Numéro de facture : 50 caractères max." };
  const split = computeShares({
    kind,
    amountCents: amount,
    payerId: paidBy,
    memberIds: members.map((m) => m.id),
    otherPct: pct,
    pcts,
    counterpart: Number(input.counterpart) || null,
  });
  if ("error" in split) return { error: split.error };
  const shares = split.shares;
  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? "?";
  const splitText = (list: Share[]) =>
    members.length > 2 ? list.map((x) => `${nameOf(x.user_id)} ${formatMoney(x.share_cents)}`).join(", ") || "(aucune part)" : undefined;

  const prep = await prepareUploads(ledgerId, input.uploads ?? "");
  if ("error" in prep) return { error: prep.error };

  const allSuppliers = await listSuppliers(ledgerId);
  const supplierIds = allSuppliers.filter((s) => input.suppliers.includes(s.id)).map((s) => s.id);
  const namesOf = (ids: number[]) => allSuppliers.filter((s) => ids.includes(s.id)).map((s) => s.name).join(", ");

  const otherShare = shares.reduce((sum, x) => sum + x.share_cents, 0);
  const snapshot: Snapshot = {
    kind,
    description,
    amount_cents: amount,
    paid_by_name: payer.name,
    other_share_cents: otherShare,
    occurred_on: date,
    invoice_number: invoice,
    suppliers: namesOf(supplierIds),
    split: splitText(shares),
  };

  let txId: number;
  if (input.id) {
    txId = Number(input.id);
    const before = await getTransaction(ledgerId, txId);
    if (!before) return { error: "Transaction introuvable." };
    await q(
      `UPDATE transactions SET kind=$1, paid_by=$2, amount_cents=$3, other_share_cents=$4,
         description=$5, occurred_on=$6, invoice_number=$7, updated_at=now()
       WHERE id=$8 AND ledger_id=$9 AND deleted_at IS NULL`,
      [kind, paidBy, amount, otherShare, description, date, invoice, txId, ledgerId],
    );
    await logAudit(ledgerId, user.id, "transaction.update", txId, {
      before: {
        kind: before.kind,
        description: before.description,
        amount_cents: before.amount_cents,
        paid_by_name: before.payer_name,
        other_share_cents: before.other_share_cents,
        occurred_on: before.occurred_on,
        invoice_number: before.invoice_number,
        suppliers: namesOf(before.supplier_ids),
        split: splitText(before.shares),
      } satisfies Snapshot,
      after: snapshot,
    });
  } else {
    try {
      const rows = await q<{ id: number }>(
        `INSERT INTO transactions (ledger_id, kind, paid_by, amount_cents, other_share_cents, description, occurred_on, created_by, invoice_number, client_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [ledgerId, kind, paidBy, amount, otherShare, description, date, user.id, invoice, input.clientId || null],
      );
      txId = rows[0].id;
    } catch (e) {
      // Deux synchronisations simultanées de la même transaction : la seconde retrouve la première
      const dup = input.clientId
        ? await q<{ id: number }>("SELECT id FROM transactions WHERE ledger_id = $1 AND client_id = $2", [ledgerId, input.clientId])
        : [];
      if (dup.length) return { id: dup[0].id, duplicate: true };
      throw e;
    }
    await logAudit(ledgerId, user.id, "transaction.create", txId, { after: snapshot });
  }
  await setSuppliers(txId, supplierIds);
  await setShares(txId, shares);
  await attach(user, ledgerId, txId, description, prep.prepared);

  // Notification aux autres participants, après l'envoi de la réponse
  const verb = input.id ? "a modifié" : "a ajouté";
  after(() =>
    notifyLedger(ledgerId, user.id, {
      title: "Gestion des finances",
      body: `${user.name} ${verb} « ${description} » (${formatMoney(amount)})`,
      url: "/transactions",
      tag: `tx-${txId}`,
    }),
  );
  return { id: txId };
}
