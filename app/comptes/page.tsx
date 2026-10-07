import { switchAccount } from "@/app/actions";
import { listAccounts, listOtherUsers } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import CreateAccountForm from "@/components/AccountForms";

export default async function AccountsPage() {
  const user = await requireUser({ allowNone: true });
  const [accounts, people] = await Promise.all([listAccounts(user.id), listOtherUsers(user.id)]);

  return (
    <>
      <Nav name={user.name} />
      <main>
        <h1>Comptes de dépenses</h1>

        <div className="card">
          {accounts.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              Vous n&apos;avez encore aucun compte de dépenses : créez-en un ci-dessous avec une ou plusieurs personnes.
            </p>
          )}
          {accounts.map((a) => (
            <div className="account-row" key={a.id}>
              <div>
                <div>
                  <span className="badge">{a.isGroup ? `Groupe · ${a.members.length}` : "À deux"}</span>
                  <strong>{a.label}</strong>
                </div>
                <div className="muted">{a.members.map((m) => (m.id === user.id ? "Vous" : m.name)).join(", ")}</div>
              </div>
              {a.id === user.ledger_id ? (
                <span className="muted">Compte actif</span>
              ) : (
                <form action={switchAccount}>
                  <input type="hidden" name="ledger" value={a.id} />
                  <button>Ouvrir</button>
                </form>
              )}
            </div>
          ))}
        </div>

        <h2>Nouveau compte</h2>
        <CreateAccountForm people={people} />
        <p className="muted">
          Toutes les personnes inscrites au service sont listées. Les personnes que vous cochez sont ajoutées tout de suite au
          compte et peuvent voir toutes ses transactions.
        </p>
      </main>
    </>
  );
}
