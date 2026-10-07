import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getMembers } from "@/lib/ledger";
import { q } from "@/lib/db";
import Nav from "@/components/Nav";
import { NameForm, PasswordForm } from "@/components/SettingsForms";

export default async function SettingsPage() {
  const user = await requireUser();
  const [members, ledger] = await Promise.all([
    getMembers(user.ledger_id),
    q<{ invite_code: string }>("SELECT invite_code FROM ledgers WHERE id = $1", [user.ledger_id]),
  ]);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const code = ledger[0]?.invite_code ?? "";
  const other = members.find((m) => m.id !== user.id);

  return (
    <>
      <Nav name={user.name} />
      <main>
        <h1>Paramètres</h1>

        <h2>Participants</h2>
        <div className="card stack">
          <div>Vous : {user.name} ({user.email})</div>
          <div>Autre participant : {other ? other.name : <span className="muted">pas encore inscrit</span>}</div>
          {!other && (
            <>
              <div>
                Code d&apos;invitation : <code className="invite">{code}</code>
              </div>
              <div className="muted">
                Lien direct : {proto}://{host}/register?invite={code}
              </div>
            </>
          )}
        </div>

        <h2>Profil</h2>
        <NameForm name={user.name} />

        <h2>Mot de passe</h2>
        <PasswordForm />
      </main>
    </>
  );
}
