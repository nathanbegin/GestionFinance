"use client";

import { switchAccount } from "@/app/actions";
import type { Account } from "@/lib/accounts";

/** Choix du compte de dépenses actif (le changement s'applique tout de suite). */
export default function AccountSwitcher({ accounts, activeId }: { accounts: Account[]; activeId: number }) {
  return (
    <form action={switchAccount} className="account-switch">
      <select
        name="ledger"
        value={activeId}
        aria-label="Compte de dépenses"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.isGroup ? "👥 " : ""}
            {a.label}
          </option>
        ))}
      </select>
    </form>
  );
}
