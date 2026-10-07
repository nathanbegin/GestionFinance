import Link from "next/link";
import { getUser } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import AccountSwitcher from "./AccountSwitcher";
import LiveRefresh from "./LiveRefresh";
import LogoutForm from "./LogoutForm";
import QueueStatus from "./QueueStatus";
import Logo from "./Logo";
import NavLinks from "./NavLinks";

export default async function Nav({ name }: { name: string }) {
  const user = await getUser();
  const accounts = user ? await listAccounts(user.id) : [];
  return (
    <>
      <LiveRefresh />
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            <Logo size={30} />
            <span>Gestion des finances</span>
          </Link>
          {user && accounts.length > 0 && <AccountSwitcher accounts={accounts} activeId={user.ledger_id} />}
          {user && <QueueStatus userId={user.id} />}
          <LogoutForm name={name} />
        </div>
        <NavLinks />
      </header>
      {user && user.ledger_id > 0 && (
        <Link href="/nouvelle" className="fab" aria-label="Nouvelle transaction">
          +
        </Link>
      )}
    </>
  );
}
