"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { q, qTransaction } from "@/lib/db";
import { createSession, destroySession, requireUser, setActiveLedger, type User } from "@/lib/auth";
import { getMembers, getTransaction, listTransactions } from "@/lib/ledger";
import { logAudit, type Snapshot } from "@/lib/audit";
import { formatMoney, parseAmount } from "@/lib/money";
import { computeShares, type Share } from "@/lib/shares";
import { MAX_ROWS, parseWorkbook } from "@/lib/importXlsx";
import { insertAttachments, prepareUploads, type Prepared } from "@/lib/attachments";
import { copySuppliers, listSuppliers, readLogo, seedSuppliers } from "@/lib/suppliers";
import { saveTransactionCore } from "@/lib/transactions";
import { notifyLedger } from "@/lib/push";
import { matchSuppliers, splitKeywords } from "@/lib/supplierMatch";

export type FormState = { error?: string; ok?: string; details?: string[] } | undefined;

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

  let joinLedger: number | null = null;
  if (invite) {
    const rows = await q<{ id: number }>("SELECT id FROM ledgers WHERE invite_code = $1", [invite]);
    if (!rows.length) return { error: "Code d'invitation invalide." };
    joinLedger = rows[0].id;
    const count = await q<{ n: number }>("SELECT count(*)::int AS n FROM ledger_members WHERE ledger_id = $1", [joinLedger]);
    if (count[0].n >= 2) return { error: "Ce code d'invitation n'est plus utilisable : le compte a déjà ses participants." };
  } else if (process.env.ALLOW_NEW_LEDGERS === "false") {
    return { error: "Les inscriptions sans code d'invitation sont désactivées." };
  }

  const hash = await bcrypt.hash(password, 10);
  const users = await q<{ id: number }>(
    "INSERT INTO users (ledger_id, email, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id",
    [joinLedger, email, name, hash],
  );
  const userId = users[0].id;
  if (joinLedger) {
    await q("INSERT INTO ledger_members (ledger_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [joinLedger, userId]);
    await logAudit(joinLedger, userId, "ledger.join", null);
  }

  await createSession(userId);
  if (joinLedger) await setActiveLedger(joinLedger);
  redirect(joinLedger ? "/" : "/comptes");
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

/* ---------- Comptes de dépenses ---------- */

export async function createAccount(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser({ allowNone: true });
  const ids = Array.from(new Set(f.getAll("members").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n !== user.id)));
  const name = str(f, "name");
  if (!ids.length) return { error: "Choisissez au moins une personne." };
  if (ids.length > 15) return { error: "Un groupe est limité à 16 personnes." };
  if (name.length > 60) return { error: "Nom du compte : 60 caractères max." };
  const found = await q<{ id: number }>("SELECT id FROM users WHERE id = ANY($1::int[])", [ids]);
  if (found.length !== ids.length) return { error: "Une des personnes choisies n'existe plus." };

  const code = randomBytes(5).toString("hex").toUpperCase();
  const rows = await q<{ id: number }>(
    "INSERT INTO ledgers (invite_code, name, created_by) VALUES ($1, $2, $3) RETURNING id",
    [code, name || null, user.id],
  );
  const ledgerId = rows[0].id;
  await q("INSERT INTO ledger_members (ledger_id, user_id) SELECT $1, unnest($2::int[])", [ledgerId, [user.id, ...ids]]);
  // Fournisseurs : on repart de ceux du compte actif (avec leurs logos), sinon des fournisseurs par défaut
  if (user.ledger_id) await copySuppliers(user.ledger_id, ledgerId);
  else await seedSuppliers(ledgerId);
  await logAudit(ledgerId, user.id, "ledger.create", null);

  await setActiveLedger(ledgerId);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function switchAccount(f: FormData) {
  const user = await requireUser({ allowNone: true });
  const id = Number(str(f, "ledger"));
  if (user.ledgers.includes(id)) await setActiveLedger(id);
  revalidatePath("/", "layout");
  redirect("/");
}

/* ---------- Transactions ---------- */

export async function deleteAttachment(f: FormData) {
  const user = await requireUser();
  const id = Number(str(f, "id"));
  const rows = await q<{ transaction_id: number; filename: string; description: string; created_by: number }>(
    `SELECT a.transaction_id, a.filename, t.description, a.created_by
     FROM attachments a JOIN transactions t ON t.id = a.transaction_id
     WHERE a.id = $1 AND a.ledger_id = $2 AND a.deleted_at IS NULL`,
    [id, user.ledger_id],
  );
  const a = rows[0];
  if (!a || a.created_by !== user.id) return; // seul l'auteur de l'envoi peut retirer le fichier
  await q("UPDATE attachments SET deleted_at = now() WHERE id = $1", [id]);
  await logAudit(user.ledger_id, user.id, "attachment.remove", a.transaction_id, {
    filename: a.filename,
    description: a.description,
  });
  revalidatePath("/", "layout");
}

export async function saveTransaction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const members = await getMembers(user.ledger_id);
  const pcts: Record<number, string> = {};
  for (const m of members) pcts[m.id] = str(f, `pct_${m.id}`);

  const res = await saveTransactionCore(user, user.ledger_id, {
    id: str(f, "id") ? Number(str(f, "id")) : undefined,
    kind: str(f, "kind"),
    description: str(f, "description"),
    amount: str(f, "amount"),
    paid_by: Number(str(f, "paid_by")),
    occurred_on: str(f, "occurred_on"),
    share_pct: str(f, "share_pct"),
    pcts,
    counterpart: Number(str(f, "counterpart")) || null,
    invoice_number: str(f, "invoice_number"),
    suppliers: f.getAll("suppliers").map((x) => Number(x)),
    uploads: String(f.get("uploads") ?? ""),
  });
  if ("error" in res) return { error: res.error };

  revalidatePath("/", "layout");
  revalidatePath("/historique");
  redirect("/");
}

export async function deleteTransaction(f: FormData) {
  const user = await requireUser();
  const id = Number(str(f, "id"));
  const before = await getTransaction(user.ledger_id, id);
  if (!before) return;
  if (before.created_by !== user.id) return; // seul le créateur peut supprimer
  await q("UPDATE transactions SET deleted_at = now() WHERE id = $1 AND ledger_id = $2", [id, user.ledger_id]);
  await logAudit(user.ledger_id, user.id, "transaction.delete", id, {
    before: {
      kind: before.kind,
      description: before.description,
      amount_cents: before.amount_cents,
      paid_by_name: before.payer_name,
      other_share_cents: before.other_share_cents,
      occurred_on: before.occurred_on,
      invoice_number: before.invoice_number,
    } satisfies Snapshot,
  });
  revalidatePath("/", "layout");
  revalidatePath("/historique");
  after(() =>
    notifyLedger(user.ledger_id, user.id, {
      title: "Gestion des finances",
      body: `${user.name} a supprimé « ${before.description} » (${formatMoney(before.amount_cents)})`,
      url: "/transactions",
      tag: `tx-${id}`,
    }),
  );
}

/* ---------- Importation en lot ---------- */

export async function importTransactions(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const members = await getMembers(user.ledger_id);
  if (members.length !== 2) return { error: "L'importation Excel est réservée aux comptes à deux personnes." };

  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier .xlsx." };
  if (file.size > 2_000_000) return { error: "Fichier trop volumineux (2 Mo max)." };

  const suppliers = await listSuppliers(user.ledger_id);
  const { rows, errors } = await parseWorkbook(await file.arrayBuffer(), members, user, suppliers);
  if (errors.length)
    return { error: "Rien n'a été importé. Corrigez le fichier et réessayez.", details: errors.slice(0, 30) };
  if (rows.length > MAX_ROWS) return { error: `Maximum ${MAX_ROWS} lignes par fichier.` };

  // Tout ou rien : chaque transaction est suivie de son entrée dans le journal.
  const queries = rows.flatMap((r) => [
    {
      text: `INSERT INTO transactions (ledger_id, kind, paid_by, amount_cents, other_share_cents, description, occurred_on, created_by, invoice_number)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      params: [user.ledger_id, r.kind, r.paid_by, r.amount_cents, r.other_share_cents, r.description, r.occurred_on, user.id, r.invoice_number],
    },
    {
      text: `INSERT INTO transaction_shares (transaction_id, user_id, share_cents)
             SELECT currval(pg_get_serial_sequence('transactions','id')), $1::int, $2::int WHERE $2::int > 0`,
      params: [members.find((m) => m.id !== r.paid_by)!.id, r.other_share_cents],
    },
    {
      text: `INSERT INTO transaction_suppliers (transaction_id, supplier_id)
             SELECT currval(pg_get_serial_sequence('transactions','id')), unnest($1::int[])`,
      params: [r.supplier_ids],
    },
    {
      text: `INSERT INTO audit_log (ledger_id, user_id, transaction_id, action, details)
             VALUES ($1, $2, currval(pg_get_serial_sequence('transactions','id')), 'transaction.create', $3)`,
      params: [
        user.ledger_id,
        user.id,
        JSON.stringify({
          after: {
            kind: r.kind,
            description: r.description,
            amount_cents: r.amount_cents,
            paid_by_name: r.paid_by_name,
            other_share_cents: r.other_share_cents,
            occurred_on: r.occurred_on,
            invoice_number: r.invoice_number,
            suppliers: suppliers.filter((s) => r.supplier_ids.includes(s.id)).map((s) => s.name).join(", "),
          } satisfies Snapshot,
        }),
      ],
    },
  ]);
  await qTransaction(queries);

  revalidatePath("/", "layout");
  revalidatePath("/historique");
  return { ok: `${rows.length} transaction${rows.length > 1 ? "s" : ""} importée${rows.length > 1 ? "s" : ""}.` };
}

/* ---------- Fournisseurs ---------- */

const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Mots-clés nettoyés (20 max, 60 caractères chacun) ou message d'erreur. */
function cleanKeywords(raw: string): { error: string } | { keywords: string | null } {
  const list = splitKeywords(raw);
  if (list.length > 20 || list.some((k) => k.length > 60)) return { error: "Mots-clés : 20 maximum, 60 caractères chacun." };
  return { keywords: list.length ? list.join(", ") : null };
}

export async function addSupplier(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(f, "name");
  const color = str(f, "color") || "#2459d6";
  if (name.length < 1 || name.length > 60) return { error: "Nom requis (60 caractères max)." };
  if (!COLOR.test(color)) return { error: "Couleur invalide." };
  const kw = cleanKeywords(str(f, "keywords"));
  if ("error" in kw) return { error: kw.error };
  const logo = await readLogo(f.get("logo"));
  if (logo && "error" in logo) return { error: logo.error };
  const dup = await q("SELECT 1 FROM suppliers WHERE ledger_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL", [
    user.ledger_id,
    name,
  ]);
  if (dup.length) return { error: "Ce fournisseur existe déjà." };
  await q(
    "INSERT INTO suppliers (ledger_id, name, color, keywords, logo_type, logo_data) VALUES ($1, $2, $3, $4, $5, decode($6, 'base64'))",
    [user.ledger_id, name, color, kw.keywords, logo?.type ?? null, logo?.b64 ?? null],
  );
  await logAudit(user.ledger_id, user.id, "supplier.change", null, { description: `Fournisseur ajouté : ${name}` });
  revalidatePath("/", "layout");
  return { ok: `« ${name} » ajouté.` };
}

export async function updateSupplier(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = Number(str(f, "id"));
  const name = str(f, "name");
  const color = str(f, "color");
  if (name.length < 1 || name.length > 60) return { error: "Nom requis (60 caractères max)." };
  if (!COLOR.test(color)) return { error: "Couleur invalide." };
  const kw = cleanKeywords(str(f, "keywords"));
  if ("error" in kw) return { error: kw.error };
  const logo = await readLogo(f.get("logo"));
  if (logo && "error" in logo) return { error: logo.error };
  const dup = await q(
    "SELECT 1 FROM suppliers WHERE ledger_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL AND id <> $3",
    [user.ledger_id, name, id],
  );
  if (dup.length) return { error: "Un autre fournisseur porte déjà ce nom." };

  const removeLogo = str(f, "remove_logo") === "on";
  const res = await q(
    `UPDATE suppliers SET name = $1, color = $2, keywords = $8, updated_at = now(),
       logo_type = CASE WHEN $3::text IS NOT NULL THEN $3 WHEN $4::boolean THEN NULL ELSE logo_type END,
       logo_data = CASE WHEN $5::text IS NOT NULL THEN decode($5, 'base64') WHEN $4::boolean THEN NULL ELSE logo_data END
     WHERE id = $6 AND ledger_id = $7 AND deleted_at IS NULL RETURNING id`,
    [name, color, logo?.type ?? null, removeLogo, logo?.b64 ?? null, id, user.ledger_id, kw.keywords],
  );
  if (!res.length) return { error: "Fournisseur introuvable." };
  await logAudit(user.ledger_id, user.id, "supplier.change", null, { description: `Fournisseur modifié : ${name}` });
  revalidatePath("/", "layout");
  return { ok: "Fournisseur mis à jour." };
}

/** Lie automatiquement les fournisseurs détectés dans la description des transactions qui n'en ont aucun. */
export async function autoLinkSuppliers(_: FormState, __: FormData): Promise<FormState> {
  const user = await requireUser();
  const [suppliers, txs] = await Promise.all([listSuppliers(user.ledger_id), listTransactions(user.ledger_id)]);
  const queries: { text: string; params: unknown[] }[] = [];
  let count = 0;
  for (const t of txs) {
    if (t.supplier_ids.length) continue;
    const ids = matchSuppliers(t.description, suppliers);
    if (!ids.length) continue;
    count++;
    const names = suppliers.filter((s) => ids.includes(s.id)).map((s) => s.name).join(", ");
    queries.push(
      {
        text: "INSERT INTO transaction_suppliers (transaction_id, supplier_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING",
        params: [t.id, ids],
      },
      {
        text: "INSERT INTO audit_log (ledger_id, user_id, transaction_id, action, details) VALUES ($1, $2, $3, 'supplier.change', $4)",
        params: [user.ledger_id, user.id, t.id, JSON.stringify({ description: `Fournisseur(s) détecté(s) d'après la description : ${names}` })],
      },
    );
  }
  if (queries.length) await qTransaction(queries);
  revalidatePath("/", "layout");
  return { ok: count ? `${count} transaction${count > 1 ? "s" : ""} mise${count > 1 ? "s" : ""} à jour.` : "Aucune transaction sans fournisseur à compléter." };
}

export async function deleteSupplier(f: FormData) {
  const user = await requireUser();
  const id = Number(str(f, "id"));
  const rows = await q<{ name: string }>(
    "UPDATE suppliers SET deleted_at = now() WHERE id = $1 AND ledger_id = $2 AND deleted_at IS NULL RETURNING name",
    [id, user.ledger_id],
  );
  if (rows.length)
    await logAudit(user.ledger_id, user.id, "supplier.change", null, { description: `Fournisseur supprimé : ${rows[0].name}` });
  revalidatePath("/", "layout");
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

export async function updateDefaultShare(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const pct = Number(str(f, "default_share_pct"));
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return { error: "La répartition doit être un entier entre 0 et 100 %." };
  await q("UPDATE users SET default_share_pct = $1 WHERE id = $2", [pct, user.id]);
  await logAudit(user.ledger_id, user.id, "profile.update", null, { default_share_pct: pct });
  revalidatePath("/", "layout");
  return { ok: "Répartition par défaut mise à jour." };
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
