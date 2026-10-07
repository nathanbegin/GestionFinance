import { requireUser } from "@/lib/auth";
import { getMembers, todayLocal } from "@/lib/ledger";
import { listSuppliers } from "@/lib/suppliers";
import Nav from "@/components/Nav";
import TransactionForm from "@/components/TransactionForm";

export default async function NewTransactionPage() {
  const user = await requireUser();
  const [members, suppliers] = await Promise.all([getMembers(user.ledger_id), listSuppliers(user.ledger_id)]);
  return (
    <>
      <Nav name={user.name} />
      <main>
        <h1>Nouvelle transaction</h1>
        {members.length === 2 ? (
          <TransactionForm
            members={members}
            submitLabel="Ajouter"
            ledgerId={user.ledger_id}
            suppliers={suppliers}
            initial={{
              kind: "expense",
              description: "",
              amount: "",
              paid_by: user.id,
              share_pct: user.default_share_pct,
              occurred_on: todayLocal(),
              invoice_number: "",
              supplier_ids: [],
            }}
          />
        ) : (
          <div className="card muted">Le deuxième participant doit d&apos;abord rejoindre le compte.</div>
        )}
      </main>
    </>
  );
}
