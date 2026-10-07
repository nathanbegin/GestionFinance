import type { User } from "./auth";
import { balanceSentence, computeNet, getMembers, listTransactions, type Member, type Tx } from "./ledger";

export type Statement = {
  members: Member[];
  txs: Tx[]; // ordre chronologique
  sentence: string;
  generatedAt: string;
  generatedBy: string;
  totals: { member: Member; expensesPaid: number; repaid: number }[];
};

export async function buildStatement(user: User): Promise<Statement> {
  const members = await getMembers(user.ledger_id);
  const all = await listTransactions(user.ledger_id);
  const txs = [...all].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id - b.id);
  const net = computeNet(txs, members);
  const generatedAt = new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Toronto",
  })
    .format(new Date())
    .replace(/[  ]/g, " ");
  const totals = members.map((m) => ({
    member: m,
    expensesPaid: txs.filter((t) => t.kind === "expense" && t.paid_by === m.id).reduce((s, t) => s + t.amount_cents, 0),
    repaid: txs.filter((t) => t.kind === "repayment" && t.paid_by === m.id).reduce((s, t) => s + t.amount_cents, 0),
  }));
  return { members, txs, sentence: balanceSentence(members, net), generatedAt, generatedBy: user.name, totals };
}
