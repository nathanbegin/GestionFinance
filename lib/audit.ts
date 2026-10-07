import { q } from "./db";
import { formatMoney } from "./money";

export type Snapshot = {
  kind: string;
  description: string;
  amount_cents: number;
  paid_by_name: string;
  other_share_cents: number;
  occurred_on: string;
  invoice_number?: string | null;
};

export async function logAudit(
  ledgerId: number,
  userId: number,
  action: string,
  transactionId: number | null,
  details: unknown = null,
) {
  await q(
    "INSERT INTO audit_log (ledger_id, user_id, transaction_id, action, details) VALUES ($1, $2, $3, $4, $5)",
    [ledgerId, userId, transactionId, action, details === null ? null : JSON.stringify(details)],
  );
}

export type AuditRow = {
  id: number;
  action: string;
  transaction_id: number | null;
  details: { before?: Snapshot; after?: Snapshot; name?: string; default_share_pct?: number; filename?: string; description?: string } | null;
  created_at: Date;
  user_name: string;
};

export async function listAudit(ledgerId: number, limit = 200): Promise<AuditRow[]> {
  return q<AuditRow>(
    `SELECT a.id, a.action, a.transaction_id, a.details, a.created_at, u.name AS user_name
     FROM audit_log a JOIN users u ON u.id = a.user_id
     WHERE a.ledger_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT $2`,
    [ledgerId, limit],
  );
}

const KIND: Record<string, string> = { expense: "Dépense", repayment: "Remboursement" };

function describe(s: Snapshot) {
  return `${KIND[s.kind] ?? s.kind} « ${s.description} » de ${formatMoney(s.amount_cents)} (payé par ${s.paid_by_name}, ${s.occurred_on})${s.invoice_number ? `, facture ${s.invoice_number}` : ""}`;
}

/** Libellé lisible d'une ligne du journal */
export function auditText(row: AuditRow): { verb: string; lines: string[] } {
  const d = row.details;
  switch (row.action) {
    case "transaction.create":
      return { verb: "a ajouté", lines: d?.after ? [describe(d.after)] : [] };
    case "transaction.delete":
      return { verb: "a supprimé", lines: d?.before ? [describe(d.before)] : [] };
    case "transaction.update": {
      const lines: string[] = [];
      if (d?.before && d?.after) {
        const b = d.before;
        const a = d.after;
        if (b.kind !== a.kind) lines.push(`Type : ${KIND[b.kind]} → ${KIND[a.kind]}`);
        if (b.description !== a.description) lines.push(`Description : « ${b.description} » → « ${a.description} »`);
        if (b.amount_cents !== a.amount_cents)
          lines.push(`Montant : ${formatMoney(b.amount_cents)} → ${formatMoney(a.amount_cents)}`);
        if (b.paid_by_name !== a.paid_by_name) lines.push(`Payé par : ${b.paid_by_name} → ${a.paid_by_name}`);
        if (b.other_share_cents !== a.other_share_cents)
          lines.push(
            `Part de l'autre : ${formatMoney(b.other_share_cents)} → ${formatMoney(a.other_share_cents)}`,
          );
        if (b.occurred_on !== a.occurred_on) lines.push(`Date : ${b.occurred_on} → ${a.occurred_on}`);
        if ((b.invoice_number ?? "") !== (a.invoice_number ?? ""))
          lines.push(`Numéro de facture : ${b.invoice_number || "(aucun)"} → ${a.invoice_number || "(aucun)"}`);
      }
      return { verb: "a modifié", lines: [d?.after ? `« ${d.after.description} »` : "", ...lines].filter(Boolean) };
    }
    case "attachment.add":
      return { verb: "a joint un fichier", lines: [`${d?.filename ?? ""} → « ${d?.description ?? ""} »`] };
    case "attachment.remove":
      return { verb: "a retiré un fichier", lines: [`${d?.filename ?? ""} de « ${d?.description ?? ""} »`] };
    case "ledger.create":
      return { verb: "a créé le compte partagé", lines: [] };
    case "ledger.join":
      return { verb: "a rejoint le compte partagé", lines: [] };
    case "profile.update":
      if (d?.default_share_pct !== undefined)
        return { verb: "a changé sa répartition par défaut", lines: [`Nouvelle valeur : ${d.default_share_pct} %`] };
      return { verb: "a changé son nom", lines: d?.name ? [`Nouveau nom : ${d.name}`] : [] };
    case "password.change":
      return { verb: "a changé son mot de passe", lines: [] };
    default:
      return { verb: row.action, lines: [] };
  }
}
