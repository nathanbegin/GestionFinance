"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { getMembers, getTransaction } from "@/lib/ledger";
import { logAudit, type Snapshot } from "@/lib/audit";
import { parseAmount } from "@/lib/money";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/* ---------- Authentification ---------- */

export async function register(_: FormState, f: FormData): Promise<FormState> {
  const name = str(f, "name");
  const email = str(f, "email").toLowerCase();
  const password = String(f.get("password") ?? "");
  const invite = str(f, "invite").toUpperCase();

  if (name.length < 1 || name.length > 60) return { error: "Nom requis (60 caractères max)." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Courriel invalide." };
  if (password.length < 8) return { error: "Le mot de passe doit contenir au moins 8 caractères." };

  const existing = await q("SELECT 1 FROM users WHERE email = $1", [email]);
  if (existing.length) return { error: "Ce courriel est déjà utilisé." };

  let ledgerId: number;
  let joined = false;
  if (invite) {
    const rows = await q<{ id: number }>("SELECT id FROM ledgers WHERE invite_code = $1", [invite]);
    if (!rows.length) return { error: "Code d'invitation invalide." };
    ledgerId = rows[0].id;
    const count = await q<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE ledger_id = $1", [ledgerId]);
    if (count[0].n >= 2) return { error: "Ce compte partagé a déjà deux participants." };
    joined = true;
  } else {
    if (process.env.ALLOW_NEW_LEDGERS === "false")
      return { error: "La création de nouveaux comptes est désactivée. Utilisez un code d'invitation." };
    const code = randomBytes(5).toString("hex").toUpperCase();
    const rows = await q<{ id: number }>("INSERT INTO ledgers (invite_code) VALUES ($1) RETURNING id", [code]);
    ledgerId = rows[0].id;
  }

  const hash = await bcrypt.hash(password, 10);
  const users = await q<{ id: number }>(
    "INSERT INTO users (ledger_id, email, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id",
    [ledgerId, email, name, hash],
  );
  const userId = users[0].id;
  await logAudit(ledgerId, userId, joined ? "ledger.join" : "ledger.create", null);

  await createSession(userId);
  redirect("/");
}

export async function login(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email").toLowerCase();
  const password = String(f.get("password") ?? "");
  const rows = await q<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email],
  );
  const ok = rows.length > 0 && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) return { error: "Courriel ou mot de passe incorrect." };
  await createSession(rows[0].id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/* ---------- Transactions ---------- */

export async function saveTransaction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const members = await getMembers(user.ledger_id);
  if (members.length !== 2) return { error: "Le deuxième participant doit d'abord rejoindre le compte." };

  const idRaw = str(f, "id");
  const kind = str(f, "kind");
  const description = str(f, "description");
  const amount = parseAmount(str(f, "amount"));
  const paidBy = Number(str(f, "paid_by"));
  const date = str(f, "occurred_on");
  const pct = Number(str(f, "share_pct") || "50");

  if (kind !== "expense" && kind !== "repayment") return { error: "Type invalide." };
  if (!description || description.length > 200) return { error: "Description requise (200 caractères max)." };
  if (amount === null) return { error: "Montant invalide (ex. : 45,90)." };
  const payer = members.find((m) => m.id === paidBy);
  if (!payer) return { error: "Payeur invalide." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: "Date invalide." };
  if (kind === "expense" && (!Number.isInteger(pct) || pct < 0 || pct > 100))
    return { error: "La part de l'autre doit être un entier entre 0 et 100 %." };

  const otherShare = kind === "repayment" ? amount : Math.round((amount * pct) / 100);
  const after: Snapshot = {
    kind,
    description,
    amount_cents: amount,
    paid_by_name: payer.name,
    other_share_cents: otherShare,
    occurred_on: date,
  };

  if (idRaw) {
    const id = Number(idRaw);
    const before = await getTransaction(user.ledger_id, id);
    if (!before) return { error: "Transaction introuvable." };
    await q(
      `UPDATE transactions SET kind=$1, paid_by=$2, amount_cents=$3, other_share_cents=$4,
         description=$5, occurred_on=$6, updated_at=now()
       WHERE id=$7 AND ledger_id=$8 AND deleted_at IS NULL`,
      [kind, paidBy, amount, otherShare, description, date, id, user.ledger_id],
    );
    await logAudit(user.ledger_id, user.id, "transaction.update", id, {
      before: {
        kind: before.kind,
        description: before.description,
        amount_cents: before.amount_cents,
        paid_by_name: before.payer_name,
        other_share_cents: before.other_share_cents,
        occurred_on: before.occurred_on,
      } satisfies Snapshot,
      after,
    });
  } else {
    const rows = await q<{ id: number }>(
      `INSERT INTO transactions (ledger_id, kind, paid_by, amount_cents, other_share_cents, description, occurred_on, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [user.ledger_id, kind, paidBy, amount, otherShare, description, date, user.id],
    );
    await logAudit(user.ledger_id, user.id, "transaction.create", rows[0].id, { after });
  }

  revalidatePath("/");
  revalidatePath("/historique");
  redirect("/");
}

export async function deleteTransaction(f: FormData) {
  const user = await requireUser();
  const id = Number(str(f, "id"));
  const before = await getTransaction(user.ledger_id, id);
  if (!before) return;
  await q("UPDATE transactions SET deleted_at = now() WHERE id = $1 AND ledger_id = $2", [id, user.ledger_id]);
  await logAudit(user.ledger_id, user.id, "transaction.delete", id, {
    before: {
      kind: before.kind,
      description: before.description,
      amount_cents: before.amount_cents,
      paid_by_name: before.payer_name,
      other_share_cents: before.other_share_cents,
      occurred_on: before.occurred_on,
    } satisfies Snapshot,
  });
  revalidatePath("/");
  revalidatePath("/historique");
}

/* ---------- Paramètres ---------- */

export async function updateName(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(f, "name");
  if (name.length < 1 || name.length > 60) return { error: "Nom requis (60 caractères max)." };
  await q("UPDATE users SET name = $1 WHERE id = $2", [name, user.id]);
  await logAudit(user.ledger_id, user.id, "profile.update", null, { name });
  revalidatePath("/", "layout");
  return { ok: "Nom mis à jour." };
}

export async function changePassword(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(f.get("current") ?? "");
  const next = String(f.get("next") ?? "");
  if (next.length < 8) return { error: "Le nouveau mot de passe doit contenir au moins 8 caractères." };
  const rows = await q<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  if (!rows.length || !(await bcrypt.compare(current, rows[0].password_hash)))
    return { error: "Mot de passe actuel incorrect." };
  await q("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(next, 10), user.id]);
  await logAudit(user.ledger_id, user.id, "password.change", null);
  return { ok: "Mot de passe modifié." };
}
