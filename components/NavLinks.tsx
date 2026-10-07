"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/transactions", label: "Transactions" },
  { href: "/nouvelle", label: "Nouvelle" },
  { href: "/importer", label: "Importer" },
  { href: "/historique", label: "Historique" },
  { href: "/parametres", label: "Paramètres" },
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Navigation principale">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
