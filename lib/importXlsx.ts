import ExcelJS from "exceljs";
import { parseAmount } from "./money";

export const SHEET = "Dépenses";
export const HEADERS = ["Date", "Description", "Montant", "Payé par", "Part de l'autre (%)", "Type"] as const;
export const MAX_ROWS = 200;
export const EXAMPLE_PREFIX = "(exemple)";

export type ImportRow = {
  line: number;
  kind: "expense" | "repayment";
  occurred_on: string;
  description: string;
  amount_cents: number;
  paid_by: number;
  paid_by_name: string;
  other_share_cents: number;
};

type Member = { id: number; name: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return text(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v) return String(v.text).trim();
    return "";
  }
  return String(v).trim();
}

function unwrap(v: ExcelJS.CellValue): ExcelJS.CellValue {
  return v && typeof v === "object" && !(v instanceof Date) && "result" in v ? (v.result as ExcelJS.CellValue) : v;
}

function isoDate(raw: ExcelJS.CellValue): string | null {
  const v = unwrap(raw);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)); // numéro de série Excel
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const m = text(v).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

function amountCents(raw: ExcelJS.CellValue): number | null {
  const v = unwrap(raw);
  if (typeof v === "number") {
    const c = Math.round(v * 100);
    return c > 0 && c <= 2_000_000_000 ? c : null;
  }
  return parseAmount(text(v));
}

export async function buildTemplate(members: Member[], today: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: HEADERS[0], key: "d", width: 14 },
    { header: HEADERS[1], key: "desc", width: 36 },
    { header: HEADERS[2], key: "amt", width: 12 },
    { header: HEADERS[3], key: "who", width: 18 },
    { header: HEADERS[4], key: "pct", width: 20 },
    { header: HEADERS[5], key: "kind", width: 16 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2459D6" } };

  const [a, b] = members;
  const date = new Date(today + "T00:00:00Z");
  ws.addRow({ d: date, desc: "(Exemple) Épicerie", amt: 87.35, who: a?.name ?? "", pct: 50, kind: "Dépense" });
  ws.addRow({ d: date, desc: "(Exemple) Remboursement par virement", amt: 40, who: b?.name ?? a?.name ?? "", pct: "", kind: "Remboursement" });
  ws.getColumn(1).numFmt = "yyyy-mm-dd";
  ws.getColumn(3).numFmt = "#,##0.00";

  const names = members.map((m) => m.name);
  const listOk = names.length > 0 && names.every((n) => !/[",]/.test(n));
  for (let r = 2; r <= MAX_ROWS + 1; r++) {
    ws.getCell(r, 6).dataValidation = { type: "list", allowBlank: true, formulae: ['"Dépense,Remboursement"'] };
    if (listOk) ws.getCell(r, 4).dataValidation = { type: "list", allowBlank: true, formulae: [`"${names.join(",")}"`] };
    ws.getCell(r, 5).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [0, 100],
      showErrorMessage: true,
      errorTitle: "Part invalide",
      error: "Entier entre 0 et 100.",
    };
  }

  const info = wb.addWorksheet("Instructions");
  info.getColumn(1).width = 110;
  [
    "Importation de dépenses : remplissez la feuille « Dépenses » (une ligne par transaction), puis importez le fichier dans l'application.",
    "",
    "Date : AAAA-MM-JJ (ex. 2026-10-07) ou une vraie date Excel. Obligatoire.",
    "Description : texte, 200 caractères max. Obligatoire.",
    "Montant : nombre positif en dollars (ex. 45,90). Obligatoire.",
    `Payé par : nom d'un participant${names.length ? ` (${names.join(" ou ")})` : ""}. Vide = la personne qui importe.`,
    "Part de l'autre (%) : entier de 0 à 100 = part due par l'autre personne. Vide = votre répartition par défaut (Paramètres). Ignoré pour un remboursement.",
    "Type : Dépense ou Remboursement. Vide = Dépense. Un remboursement compte pour 100 % du montant.",
    "",
    "Les lignes dont la description commence par « (Exemple) » sont ignorées : vous pouvez les laisser ou les supprimer.",
    `Maximum ${MAX_ROWS} lignes par fichier. Si une seule ligne est invalide, rien n'est importé et les erreurs sont listées.`,
  ].forEach((t, i) => (info.getCell(i + 1, 1).value = t));
  info.getCell(1, 1).font = { bold: true };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export type ParseResult = { rows: ImportRow[]; errors: string[] };

export async function parseWorkbook(
  data: ArrayBuffer,
  members: Member[],
  me: { id: number; default_share_pct: number },
): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    return { rows: [], errors: ["Fichier illisible : utilisez un fichier .xlsx (le modèle téléchargé)."] };
  }
  const ws = wb.getWorksheet(SHEET) ?? wb.worksheets[0];
  if (!ws) return { rows: [], errors: ["Le fichier ne contient aucune feuille."] };

  const header = HEADERS.map((_, i) => norm(text(ws.getRow(1).getCell(i + 1).value)));
  if (HEADERS.some((h, i) => header[i] !== norm(h)))
    return { rows: [], errors: [`Colonnes attendues (ligne 1) : ${HEADERS.join(" | ")}. Utilisez le modèle.`] };

  const rows: ImportRow[] = [];
  const errors: string[] = [];
  let seen = 0;

  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const cells = HEADERS.map((_, i) => row.getCell(i + 1));
    if (cells.every((c) => text(c.value) === "")) return;
    const description = text(cells[1].value);
    if (norm(description).startsWith(EXAMPLE_PREFIX)) return;
    if (++seen > MAX_ROWS) {
      if (seen === MAX_ROWS + 1) errors.push(`Trop de lignes : maximum ${MAX_ROWS} par fichier.`);
      return;
    }

    const problems: string[] = [];
    const date = isoDate(cells[0].value);
    if (!date) problems.push("date invalide (AAAA-MM-JJ)");
    if (!description || description.length > 200) problems.push("description requise (200 caractères max)");
    const amount = amountCents(cells[2].value);
    if (amount === null) problems.push("montant invalide (ex. 45,90)");

    const whoText = text(cells[3].value);
    const payer = whoText ? members.find((m) => norm(m.name) === norm(whoText)) : members.find((m) => m.id === me.id);
    if (!payer) problems.push(`« ${whoText} » n'est pas un participant`);

    const kindText = norm(text(cells[5].value));
    let kind: ImportRow["kind"] = "expense";
    if (kindText === "remboursement" || kindText === "repayment") kind = "repayment";
    else if (kindText && kindText !== "depense" && kindText !== "expense")
      problems.push("type invalide (Dépense ou Remboursement)");

    let pct = me.default_share_pct;
    const pctRaw = unwrap(cells[4].value);
    if (kind === "expense" && text(pctRaw) !== "") {
      let p = typeof pctRaw === "number" ? pctRaw : Number(text(pctRaw).replace("%", "").replace(",", ".").trim());
      if (typeof pctRaw === "number" && String(cells[4].numFmt ?? "").includes("%")) p = Math.round(p * 100);
      if (!Number.isInteger(p) || p < 0 || p > 100) problems.push("part de l'autre invalide (entier de 0 à 100)");
      else pct = p;
    }

    if (problems.length || !date || amount === null || !payer) {
      errors.push(`Ligne ${n} : ${problems.join(", ")}.`);
      return;
    }
    rows.push({
      line: n,
      kind,
      occurred_on: date,
      description,
      amount_cents: amount,
      paid_by: payer.id,
      paid_by_name: payer.name,
      other_share_cents: kind === "repayment" ? amount : Math.round((amount * pct) / 100),
    });
  });

  if (!errors.length && rows.length === 0) errors.push("Aucune ligne à importer (les lignes « Exemple » sont ignorées).");
  return { rows, errors };
}
