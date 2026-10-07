import Link from "next/link";
import { logout } from "@/app/actions";
import LiveRefresh from "./LiveRefresh";
import Logo from "./Logo";
import NavLinks from "./NavLinks";

export default function Nav({ name }: { name: string }) {
  return (
    <>
      <LiveRefresh />
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            <Logo size={30} />
            <span>Gestion des finances</span>
          </Link>
          <form action={logout} className="user">
            <span className="muted">{name}</span>
            <button className="link">Déconnexion</button>
          </form>
        </div>
        <NavLinks />
      </header>
      <Link href="/nouvelle" className="fab" aria-label="Nouvelle transaction">
        +
      </Link>
    </>
  );
}
