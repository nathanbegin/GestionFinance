import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { balanceForUser, computeNet, getMembers, listAttachments, listTransactions, todayLocal } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { q } from "@/lib/db";
import { listSuppliers } from "@/lib/suppliers";
import Nav from "@/components/Nav";
import TxList from "@/components/TxList";

export default async function Home() {
  const user = await requireUser();
  const [members, txs, attachments, suppliers, ledger] = await Promise.all([
    getMembers(user.ledger_id),
    listTransactions(user.ledger_id),
    listAttachments(user.ledger_id),
    listSuppliers(user.ledger_id),
    q<{ invite_code: string }>("SELECT invite_code FROM ledgers WHERE id = $1", [user.ledger_id]),
  ]);
  const net = computeNet(txs, members);
  const balance = balanceForUser(user.id, members, net);
  const complete = members.length === 2;
  const other = members.find((m) => m.id !== user.id);

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
          <div className="hero-label">Bonjour {user.name} · solde actuel</div>
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
            <div className="kpi-label">Payé par {other?.name ?? "l'autre"} (ce mois)</div>
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
        <TxList txs={txs.slice(0, 5)} userId={user.id} other={other} attachments={attachments} suppliers={suppliers} />

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
