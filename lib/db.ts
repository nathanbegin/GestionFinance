import { neon } from "@neondatabase/serverless";

export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const sql = neon(url);
  const rows = await sql.query(text, params);
  return rows as unknown as T[];
}

/** Exécute plusieurs requêtes dans une seule transaction (tout ou rien). */
export async function qTransaction(queries: { text: string; params: unknown[] }[]): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const sql = neon(url);
  await sql.transaction(queries.map((x) => sql.query(x.text, x.params)));
}
