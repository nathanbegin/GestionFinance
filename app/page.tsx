import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  balanceForUser,
  computeNet,
  getMembers,
  listTransactions,
  todayLocal,
} from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { deleteTransaction } from "@/app/actions";
import Nav from "@/components/Nav";
import TransactionForm from "@/components/TransactionForm";
import DeleteButton from "@/components/DeleteButton";
import { q } from "@/lib/db";

export default async function Home() {
  const user = await requireUser();
  const [members, txs, ledger] = await Promise.all([
    getMembers(user.ledger_id),
    listTransactions(user.ledger_id),
    q<{ invite_code: string }>("SELECT invite_code FROM ledgers WHERE id = $1", [user.ledger_id]),
  ]);
  const net = computeNet(txs, members);
  const balance = balanceForUser(user.id, members, net);
  const complete = members.length === 2;
  const other = members.find((m) => m.id !== user.id);

  return (
    <>
      <Nav name={user.name} />
      <main>
        <div className={`card balance ${balance.tone}`}>
          <div className="muted">Solde</div>
          <div className="amount">{balance.text}</div>
        </div>

        {!complete && (
          <div className="card stack" style={{ marginTop: 16 }}>
            <strong>Invitez l&apos;autre personne</strong>
            <p className="muted" style={{ margin: 0 }}>
              Elle doit créer son compte avec ce code d&apos;invitation :
            </p>
            <code className="invite">{ledger[0]?.invite_code}</code>
          </div>
        )}

        <div className="actions-bar">
          <a className="button" href="/api/export/pdf">
            Exporter en PDF
          </a>
          <a className="button" href="/api/export/tex">
            Exporter en LaTeX (.tex)
          </a>
        </div>

        {complete && (
          <>
            <h2>Nouvelle transaction</h2>
            <TransactionForm
              members={members}
              submitLabel="Ajouter"
              initial={{
                kind: "expense",
                description: "",
                amount: "",
                paid_by: user.id,
                share_pct: user.default_share_pct,
                occurred_on: todayLocal(),
              }}
            />
          </>
        )}

        <h2>Transactions ({txs.length})</h2>
        <div className="card">
          {txs.length === 0 && <p className="muted">Aucune transaction pour l&apos;instant.</p>}
          {txs.map((t) => (
            <div className="tx" key={t.id}>
              <div>
                <div>
                  {t.description}
                  <span className="badge">{t.kind === "expense" ? "Dépense" : "Remboursement"}</span>
                </div>
                <div className="muted">
                  {t.kind === "expense" ? "Payé par" : "Remboursé par"}{" "}
                  {t.paid_by === user.id ? "vous" : t.payer_name} · {t.occurred_on}
                  {t.kind === "expense" && ` · part de ${t.paid_by === user.id ? (other?.name ?? "l'autre") : "vous"} : ${formatMoney(t.other_share_cents)}`}
                </div>
              </div>
              <div className="right">
                <strong>{formatMoney(t.amount_cents)}</strong>
                <div className="actions">
                  <Link href={`/modifier/${t.id}`}>Modifier</Link>
                  {t.created_by === user.id && (
                    <form action={deleteTransaction}>
                      <input type="hidden" name="id" value={t.id} />
                      <DeleteButton />
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
