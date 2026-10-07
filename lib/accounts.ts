import { q } from "./db";

export type Account = {
  id: number;
  name: string | null;
  members: { id: number; name: string }[];
  /** Nom affiché : le nom donné au compte, sinon les noms des autres participants. */
  label: string;
  isGroup: boolean;
};

/** Comptes de dépenses dont l'utilisateur est membre. */
export async function listAccounts(userId: number): Promise<Account[]> {
  const rows = await q<{ id: number; name: string | null; members: { id: number; name: string }[] }>(
    `SELECT l.id, l.name,
            (SELECT json_agg(json_build_object('id', u.id, 'name', u.name) ORDER BY u.id)
               FROM ledger_members m2 JOIN users u ON u.id = m2.user_id WHERE m2.ledger_id = l.id) AS members
     FROM ledgers l JOIN ledger_members m ON m.ledger_id = l.id AND m.user_id = $1
     ORDER BY l.id`,
    [userId],
  );
  return rows.map((r) => {
    const members = r.members ?? [];
    const others = members.filter((m) => m.id !== userId).map((m) => m.name);
    return {
      id: r.id,
      name: r.name,
      members,
      label: r.name?.trim() || others.join(", ") || "Compte de dépenses",
      isGroup: members.length > 2,
    };
  });
}

/** Courriel masqué (n***@gmail.com) : distingue deux personnes du même nom sans exposer l'adresse. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "";
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Tous les utilisateurs inscrits au service, sauf l'utilisateur lui-même. */
export async function listOtherUsers(userId: number): Promise<{ id: number; name: string; hint: string }[]> {
  const rows = await q<{ id: number; name: string; email: string }>(
    "SELECT id, name, email FROM users WHERE id <> $1 ORDER BY lower(name), id",
    [userId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, hint: maskEmail(r.email) }));
}
