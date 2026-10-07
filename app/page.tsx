import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { balanceForUser, computeNet, getMembers, listAttachments, listTransactions, suggestSettlements, todayLocal } from "@/lib/ledger";
import { listAccounts } from "@/lib/accounts";
import { formatMoney } from "@/lib/money";
import { q } from "@/lib/db";
import { listSuppliers } from "@/lib/suppliers";
import Nav from "@/components/Nav";
import TxList from "@/components/TxList";

export default async function Home() {
  const user = await requireUser();
  const [members, txs, attachments, suppliers, ledger, accounts] = await Promise.all([
    getMembers(user.ledger_id),
    listTransactions(user.ledger_id),
    listAttachments(user.ledger_id),
    listSuppliers(user.ledger_id),
    q<{ invite_code: string }>("SELECT invite_code FROM ledgers WHERE id = $1", [user.ledger_id]),
    listAccounts(user.id),
  ]);
  const net = computeNet(txs, members);
  const balance = balanceForUser(user.id, members, net);
  const complete = members.length >= 2;
  const isGroup = members.length > 2;
  const other = members.find((m) => m.id !== user.id);
  const account = accounts.find((a) => a.id === user.ledger_id);
  const settlements = isGroup ? suggestSettlements(members, net) : [];

  const month = todayLocal().slice(0, 7);
  const inMonth = txs.filter((t) => t.kind === "expense" && t.occurred_on.startsWith(month));
  const sum = (list: typeof txs) => list.reduce((s, t) => s + t.amount_cents, 0);
  const monthLabel = new Intl.DateTimeFormat("fr-CA", {
    month: "long",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date());
  const fileCount = [...attachments.values()].reduce((s, l) => s + l.length, 0);

  return (
    <>
      <Nav name={user.name} />
      <main>
        <section className={`hero ${balance.tone}`}>
          <div className="hero-label">
            {account?.label ?? "Compte"} · solde de {user.name}
          </div>
          <div className="hero-amount">{balance.text}</div>
          <div className="hero-actions">
            <Link className="button solid" href="/nouvelle">
              + Nouvelle transaction
            </Link>
            <Link className="button ghost" href="/importer">
              Importer un fichier Excel
            </Link>
          </div>
        </section>

        {isGroup && (
          <div className="card stack" style={{ marginTop: 16 }}>
            <strong>Solde de chaque participant</strong>
            {members.map((m) => {
              const v = net.get(m.id) ?? 0;
              return (
                <div key={m.id} className="split-total">
                  <span>{m.id === user.id ? "Vous" : m.name}</span>
                  <strong className={v > 0 ? "ok" : v < 0 ? "error" : "muted"}>
                    {v > 0 ? "On lui doit " : v < 0 ? "Doit " : "À jour "}
                    {v !== 0 && formatMoney(Math.abs(v))}
                  </strong>
                </div>
              );
            })}
            {settlements.length > 0 && (
              <>
                <span className="muted">Pour tout régler :</span>
                <ul className="settle">
                  {settlements.map((s, i) => (
                    <li key={i}>
                      {s.from.id === user.id ? "Vous" : s.from.name} → {s.to.id === user.id ? "vous" : s.to.name} : {formatMoney(s.cents)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {!complete && (
          <div className="card stack" style={{ marginTop: 16 }}>
            <strong>Invitez l&apos;autre personne</strong>
            <p className="muted" style={{ margin: 0 }}>
              Elle doit créer son compte avec ce code d&apos;invitation :
            </p>
            <code className="invite">{ledger[0]?.invite_code}</code>
          </div>
        )}

        <div className="kpis">
          <div className="kpi">
            <div className="kpi-label">Dépensé en {monthLabel}</div>
            <div className="kpi-value">{formatMoney(sum(inMonth))}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Payé par vous (ce mois)</div>
            <div className="kpi-value">{formatMoney(sum(inMonth.filter((t) => t.paid_by === user.id)))}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Payé par {isGroup ? "les autres" : (other?.name ?? "l'autre")} (ce mois)</div>
            <div className="kpi-value">{formatMoney(sum(inMonth.filter((t) => t.paid_by !== user.id)))}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Transactions · pièces jointes</div>
            <div className="kpi-value">
              {txs.length} · {fileCount}
            </div>
          </div>
        </div>

        <div className="section-head">
          <h2>Dernières transactions</h2>
          <Link href="/transactions">Tout voir →</Link>
        </div>
        <TxList txs={txs.slice(0, 5)} userId={user.id} other={other} members={members} attachments={attachments} suppliers={suppliers} />

        <div className="actions-bar">
          <a className="button" href="/api/export/pdf">
            Exporter en PDF
          </a>
          <a className="button" href="/api/export/tex">
            Exporter en LaTeX (.tex)
          </a>
        </div>
      </main>
    </>
  );
}
