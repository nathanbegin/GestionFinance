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
