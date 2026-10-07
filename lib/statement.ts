import type { User } from "./auth";
import { q } from "./db";
import { balanceSentence, computeNet, getMembers, listTransactions, type Member, type Tx } from "./ledger";

export type StatementSupplier = {
  id: number;
  name: string;
  color: string;
  /** Image du logo (PNG/JPEG/WebP) ou null : l'exportation dessine alors une pastille avec les initiales. */
  logo: { type: string; bytes: Uint8Array } | null;
};

export type Statement = {
  members: Member[];
  txs: Tx[]; // ordre chronologique
  sentence: string;
  generatedAt: string;
  generatedBy: string;
  totals: { member: Member; expensesPaid: number; repaid: number }[];
  /** Solde net de chacun (positif = on lui doit de l'argent, négatif = il doit). */
  balances: { member: Member; net: number }[];
  suppliers: StatementSupplier[];
};

export async function buildStatement(user: User): Promise<Statement> {
  const members = await getMembers(user.ledger_id);
  const all = await listTransactions(user.ledger_id);
  const txs = all
    .map((t) => (t.invoice_number ? { ...t, description: `${t.description} (fact. ${t.invoice_number})` } : t))
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id - b.id);
  const net = computeNet(txs, members);
  const generatedAt = new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Toronto",
  })
    .format(new Date())
    .replace(/[\u00a0\u202f]/g, " ");
  const totals = members.map((m) => ({
    member: m,
    expensesPaid: txs.filter((t) => t.kind === "expense" && t.paid_by === m.id).reduce((s, t) => s + t.amount_cents, 0),
    repaid: txs.filter((t) => t.kind === "repayment" && t.paid_by === m.id).reduce((s, t) => s + t.amount_cents, 0),
  }));
  const balances = members.map((m) => ({ member: m, net: net.get(m.id) ?? 0 }));

  const rows = await q<{ id: number; name: string; color: string; logo_type: string | null; b64: string | null }>(
    `SELECT id, name, color, logo_type, encode(logo_data, 'base64') AS b64
     FROM suppliers WHERE ledger_id = $1 AND deleted_at IS NULL`,
    [user.ledger_id],
  );
  const suppliers: StatementSupplier[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    logo: r.b64 && r.logo_type ? { type: r.logo_type, bytes: new Uint8Array(Buffer.from(r.b64, "base64")) } : null,
  }));

  return {
    members,
    txs,
    sentence: balanceSentence(members, net),
    generatedAt,
    generatedBy: user.name,
    totals,
    balances,
    suppliers,
  };
}
