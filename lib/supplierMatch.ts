/** Détection des fournisseurs dans un texte (sans dépendance serveur : utilisable aussi dans le navigateur). */

export type MatchableSupplier = { id: number; name: string; keywords?: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Mots-clés saisis par l'utilisateur : séparés par des virgules ou points-virgules. */
export function splitKeywords(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Identifiants des fournisseurs dont le nom ou un mot-clé apparaît (mot entier) dans le texte. */
export function matchSuppliers(text: string, suppliers: MatchableSupplier[]): number[] {
  const hay = norm(text);
  if (!hay.trim()) return [];
  const found: number[] = [];
  for (const s of suppliers) {
    const terms = [s.name, ...splitKeywords(s.keywords ?? "")].map(norm).filter((t) => t.trim().length >= 2);
    const hit = terms.some((t) => new RegExp(`(^|[^a-z0-9])${escapeRe(t.trim())}($|[^a-z0-9])`).test(hay));
    if (hit) found.push(s.id);
  }
  return found;
}
