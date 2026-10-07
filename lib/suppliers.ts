import { q } from "./db";
import { sniffType } from "./attachments";

export type Supplier = {
  id: number;
  name: string;
  color: string;
  has_logo: boolean;
  /** Mots-clés supplémentaires (séparés par des virgules) qui déclenchent la suggestion. */
  keywords: string;
  /** Version du logo (change à chaque modification : invalide le cache du navigateur). */
  v: number;
};

export const DEFAULT_SUPPLIERS: { name: string; color: string; keywords?: string }[] = [
  { name: "Uber", color: "#000000" },
  { name: "Sixt", color: "#ff5f00" },
  { name: "TELUS", color: "#4b286d" },
  { name: "Fertilisation du Nord ProVert", color: "#2e7d32", keywords: "Fertilisation du Nord, ProVert" },
];

export const MAX_LOGO_BYTES = 400_000;

export async function listSuppliers(ledgerId: number): Promise<Supplier[]> {
  return q<Supplier>(
    `SELECT id, name, color, COALESCE(keywords, '') AS keywords, (logo_data IS NOT NULL) AS has_logo, extract(epoch FROM updated_at)::int AS v
     FROM suppliers WHERE ledger_id = $1 AND deleted_at IS NULL ORDER BY lower(name)`,
    [ledgerId],
  );
}

/** Fournisseurs proposés d'office dans un nouveau compte partagé. */
export async function seedSuppliers(ledgerId: number) {
  for (const s of DEFAULT_SUPPLIERS)
    await q("INSERT INTO suppliers (ledger_id, name, color, keywords) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [
      ledgerId,
      s.name,
      s.color,
      s.keywords ?? null,
    ]);
}

/** Copie les fournisseurs (logos compris) d'un compte vers un autre. */
export async function copySuppliers(fromLedger: number, toLedger: number) {
  await q(
    `INSERT INTO suppliers (ledger_id, name, color, keywords, logo_type, logo_data)
     SELECT $2, name, color, keywords, logo_type, logo_data FROM suppliers
     WHERE ledger_id = $1 AND deleted_at IS NULL ON CONFLICT DO NOTHING`,
    [fromLedger, toLedger],
  );
}

/** Valide un fichier de logo : PNG, JPEG ou WebP seulement (pas de SVG : il peut contenir du code). */
export async function readLogo(file: unknown): Promise<null | { error: string } | { type: string; b64: string }> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_LOGO_BYTES) return { error: "Logo trop lourd (400 Ko max)." };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffType(buf);
  if (type !== "image/png" && type !== "image/jpeg" && type !== "image/webp")
    return { error: "Logo : utilisez une image PNG, JPEG ou WebP." };
  return { type, b64: buf.toString("base64") };
}
