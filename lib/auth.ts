import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { q } from "./db";

const COOKIE = "session";
/** Compte de dépenses actif (un utilisateur peut appartenir à plusieurs comptes). */
export const LEDGER_COOKIE = "ledger";

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET manquant ou trop court");
  return new TextEncoder().encode(s);
}

export type User = {
  id: number;
  /** Compte de dépenses actif ; 0 si l'utilisateur n'appartient encore à aucun compte. */
  ledger_id: number;
  /** Identifiants de tous les comptes dont l'utilisateur est membre. */
  ledgers: number[];
  email: string;
  name: string;
  default_share_pct: number;
};

export async function createSession(userId: number) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(LEDGER_COOKIE);
}

/** Mémorise le compte actif (la validité est revérifiée à chaque requête). */
export async function setActiveLedger(ledgerId: number) {
  (await cookies()).set(LEDGER_COOKIE, String(ledgerId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

// cache() : une seule requête SQL par requête HTTP, même si plusieurs composants appellent getUser()
export const getUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    const rows = await q<Omit<User, "ledger_id">>(
      `SELECT u.id, u.email, u.name, u.default_share_pct,
              COALESCE((SELECT array_agg(m.ledger_id ORDER BY m.ledger_id) FROM ledger_members m WHERE m.user_id = u.id), '{}')::int[] AS ledgers
       FROM users u WHERE u.id = $1`,
      [payload.uid],
    );
    if (!rows[0]) return null;
    const wanted = Number(jar.get(LEDGER_COOKIE)?.value);
    const ledger_id = rows[0].ledgers.includes(wanted) ? wanted : (rows[0].ledgers[0] ?? 0);
    return { ...rows[0], ledger_id };
  } catch {
    return null;
  }
});

/** Utilisateur connecté ; sans compte de dépenses actif, redirige vers la page « Comptes » (sauf allowNone). */
export async function requireUser(opts: { allowNone?: boolean } = {}): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  if (u.ledger_id === 0 && !opts.allowNone) redirect("/comptes");
  return u;
}
