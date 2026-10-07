import { q } from "./db";
import { formatMoney } from "./money";

export type Member = { id: number; name: string };

export type Tx = {
  id: number;
  kind: "expense" | "repayment" | "opening";
  paid_by: number;
  amount_cents: number;
  other_share_cents: number;
  description: string;
  occurred_on: string; // YYYY-MM-DD
  created_by: number;
  payer_name: string;
  invoice_number: string | null;
  supplier_ids: number[];
  /** Part due par chaque participant (hors payeur) : { user_id, share_cents }. */
  shares: { user_id: number; share_cents: number }[];
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
  return q<Member>(
    "SELECT u.id, u.name FROM ledger_members m JOIN users u ON u.id = m.user_id WHERE m.ledger_id = $1 ORDER BY u.id",
    [ledgerId],
  );
}

export async function listTransactions(ledgerId: number): Promise<Tx[]> {
  return q<Tx>(
    `SELECT t.id, t.kind, t.paid_by, t.amount_cents, t.other_share_cents, t.description,
            to_char(t.occurred_on, 'YYYY-MM-DD') AS occurred_on, t.created_by, u.name AS payer_name, t.invoice_number,
            COALESCE((SELECT array_agg(ts.supplier_id ORDER BY ts.supplier_id) FROM transaction_suppliers ts WHERE ts.transaction_id = t.id), '{}')::int[] AS supplier_ids,
            COALESCE((SELECT json_agg(json_build_object('user_id', s.user_id, 'share_cents', s.share_cents) ORDER BY s.user_id) FROM transaction_shares s WHERE s.transaction_id = t.id), '[]'::json) AS shares
     FROM transactions t JOIN users u ON u.id = t.paid_by
     WHERE t.ledger_id = $1 AND t.deleted_at IS NULL
     ORDER BY t.occurred_on DESC, t.id DESC`,
    [ledgerId],
  );
}

export async function getTransaction(ledgerId: number, id: number): Promise<Tx | null> {
  const rows = await q<Tx>(
    `SELECT t.id, t.kind, t.paid_by, t.amount_cents, t.other_share_cents, t.description,
            to_char(t.occurred_on, 'YYYY-MM-DD') AS occurred_on, t.created_by, u.name AS payer_name, t.invoice_number,
            COALESCE((SELECT array_agg(ts.supplier_id ORDER BY ts.supplier_id) FROM transaction_suppliers ts WHERE ts.transaction_id = t.id), '{}')::int[] AS supplier_ids,
            COALESCE((SELECT json_agg(json_build_object('user_id', s.user_id, 'share_cents', s.share_cents) ORDER BY s.user_id) FROM transaction_shares s WHERE s.transaction_id = t.id), '[]'::json) AS shares
     FROM transactions t JOIN users u ON u.id = t.paid_by
     WHERE t.ledger_id = $1 AND t.id = $2 AND t.deleted_at IS NULL`,
    [ledgerId, id],
  );
  return rows[0] ?? null;
}

/**
 * Solde net par membre (en cents) : positif = on lui doit de l'argent.
 * Chaque part due par un participant crédite le payeur et débite ce participant du même montant.
 * Un remboursement ou un solde de départ est une transaction dont la contrepartie doit 100 % du montant.
 */
export function computeNet(txs: Tx[], members: Member[]): Map<number, number> {
  const net = new Map<number, number>(members.map((m) => [m.id, 0]));
  for (const t of txs) {
    let shares = t.shares ?? [];
    // Transaction sans détail de parts (ancien enregistrement d'un compte à deux) : l'autre doit other_share_cents
    if (!shares.length && t.other_share_cents > 0 && members.length === 2) {
      const other = members.find((m) => m.id !== t.paid_by);
      if (other) shares = [{ user_id: other.id, share_cents: t.other_share_cents }];
    }
    for (const sh of shares) {
      if (!net.has(t.paid_by) || !net.has(sh.user_id) || sh.user_id === t.paid_by) continue;
      net.set(t.paid_by, net.get(t.paid_by)! + sh.share_cents);
      net.set(sh.user_id, net.get(sh.user_id)! - sh.share_cents);
    }
  }
  return net;
}

/** Qui doit rembourser qui, en un minimum de virements (pour un compte de groupe). */
export function suggestSettlements(members: Member[], net: Map<number, number>): { from: Member; to: Member; cents: number }[] {
  const debtors = members.map((m) => ({ m, v: -(net.get(m.id) ?? 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const creditors = members.map((m) => ({ m, v: net.get(m.id) ?? 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const out: { from: Member; to: Member; cents: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const cents = Math.min(debtors[i].v, creditors[j].v);
    if (cents > 0) out.push({ from: debtors[i].m, to: creditors[j].m, cents });
    debtors[i].v -= cents;
    creditors[j].v -= cents;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}

/** Phrase de solde neutre (pour exports) */
export function balanceSentence(members: Member[], net: Map<number, number>): string {
  if (members.length < 2) return "Compte incomplet : aucun autre participant.";
  if (members.length === 2) {
    const [a, b] = members;
    const na = net.get(a.id) ?? 0;
    if (na === 0) return "Les comptes sont à jour : personne ne doit rien à l'autre.";
    return na > 0
      ? `${b.name} doit ${formatMoney(na)} à ${a.name}.`
      : `${a.name} doit ${formatMoney(-na)} à ${b.name}.`;
  }
  const moves = suggestSettlements(members, net);
  if (!moves.length) return "Les comptes sont à jour : personne ne doit rien aux autres.";
  return moves.map((m) => `${m.from.name} doit ${formatMoney(m.cents)} à ${m.to.name}`).join(" ; ") + ".";
}

/** Phrase de solde du point de vue de l'utilisateur connecté */
export function balanceForUser(
  me: number,
  members: Member[],
  net: Map<number, number>,
): { text: string; tone: "owed" | "owe" | "even" } {
  const others = members.filter((m) => m.id !== me);
  const mine = net.get(me) ?? 0;
  if (!others.length) return { text: "En attente d'un autre participant", tone: "even" };
  if (mine === 0) return { text: "Les comptes sont à jour", tone: "even" };
  if (others.length === 1) {
    const other = others[0];
    return mine > 0
      ? { text: `${other.name} vous doit ${formatMoney(mine)}`, tone: "owed" }
      : { text: `Vous devez ${formatMoney(-mine)} à ${other.name}`, tone: "owe" };
  }
  return mine > 0
    ? { text: `On vous doit ${formatMoney(mine)} au total`, tone: "owed" }
    : { text: `Vous devez ${formatMoney(-mine)} au total`, tone: "owe" };
}

export function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}
