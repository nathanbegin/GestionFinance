import { q } from "./db";
import { formatMoney } from "./money";

export type Member = { id: number; name: string };

export type Tx = {
  id: number;
  kind: "expense" | "repayment";
  paid_by: number;
  amount_cents: number;
  other_share_cents: number;
  description: string;
  occurred_on: string; // YYYY-MM-DD
  created_by: number;
  payer_name: string;
  invoice_number: string | null;
};

export type Attachment = {
  id: number;
  transaction_id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_by: number;
};

/** Pièces jointes actives du compte, groupées par transaction. */
export async function listAttachments(ledgerId: number): Promise<Map<number, Attachment[]>> {
  const rows = await q<Attachment>(
    `SELECT id, transaction_id, filename, content_type, size_bytes, created_by
     FROM attachments WHERE ledger_id = $1 AND deleted_at IS NULL ORDER BY id`,
    [ledgerId],
  );
  const map = new Map<number, Attachment[]>();
  for (const a of rows) map.set(a.transaction_id, [...(map.get(a.transaction_id) ?? []), a]);
  return map;
}

export async function getMembers(ledgerId: number): Promise<Member[]> {
  return q<Member>("SELECT id, name FROM users WHERE ledger_id = $1 ORDER BY id", [ledgerId]);
}

export async function listTransactions(ledgerId: number): Promise<Tx[]> {
  return q<Tx>(
    `SELECT t.id, t.kind, t.paid_by, t.amount_cents, t.other_share_cents, t.description,
            to_char(t.occurred_on, 'YYYY-MM-DD') AS occurred_on, t.created_by, u.name AS payer_name, t.invoice_number
     FROM transactions t JOIN users u ON u.id = t.paid_by
     WHERE t.ledger_id = $1 AND t.deleted_at IS NULL
     ORDER BY t.occurred_on DESC, t.id DESC`,
    [ledgerId],
  );
}

export async function getTransaction(ledgerId: number, id: number): Promise<Tx | null> {
  const rows = await q<Tx>(
    `SELECT t.id, t.kind, t.paid_by, t.amount_cents, t.other_share_cents, t.description,
            to_char(t.occurred_on, 'YYYY-MM-DD') AS occurred_on, t.created_by, u.name AS payer_name, t.invoice_number
     FROM transactions t JOIN users u ON u.id = t.paid_by
     WHERE t.ledger_id = $1 AND t.id = $2 AND t.deleted_at IS NULL`,
    [ledgerId, id],
  );
  return rows[0] ?? null;
}

/**
 * Solde net par membre (en cents) : positif = on lui doit de l'argent.
 * Chaque transaction crédite le payeur de la part de l'autre, et débite l'autre du même montant.
 * Un remboursement est une transaction dont la part de l'autre vaut 100 % du montant.
 */
export function computeNet(txs: Tx[], members: Member[]): Map<number, number> {
  const net = new Map<number, number>(members.map((m) => [m.id, 0]));
  if (members.length !== 2) return net;
  for (const t of txs) {
    const other = members.find((m) => m.id !== t.paid_by);
    if (!other || !net.has(t.paid_by)) continue;
    net.set(t.paid_by, net.get(t.paid_by)! + t.other_share_cents);
    net.set(other.id, net.get(other.id)! - t.other_share_cents);
  }
  return net;
}

/** Phrase de solde neutre (pour exports) */
export function balanceSentence(members: Member[], net: Map<number, number>): string {
  if (members.length !== 2) return "Compte incomplet : le deuxième participant n'a pas encore rejoint.";
  const [a, b] = members;
  const na = net.get(a.id) ?? 0;
  if (na === 0) return "Les comptes sont à jour : personne ne doit rien à l'autre.";
  return na > 0
    ? `${b.name} doit ${formatMoney(na)} à ${a.name}.`
    : `${a.name} doit ${formatMoney(-na)} à ${b.name}.`;
}

/** Phrase de solde du point de vue de l'utilisateur connecté */
export function balanceForUser(
  me: number,
  members: Member[],
  net: Map<number, number>,
): { text: string; tone: "owed" | "owe" | "even" } {
  const other = members.find((m) => m.id !== me);
  const mine = net.get(me) ?? 0;
  if (!other) return { text: "En attente du deuxième participant", tone: "even" };
  if (mine === 0) return { text: "Les comptes sont à jour", tone: "even" };
  return mine > 0
    ? { text: `${other.name} vous doit ${formatMoney(mine)}`, tone: "owed" }
    : { text: `Vous devez ${formatMoney(-mine)} à ${other.name}`, tone: "owe" };
}

export function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}
