import type { Statement } from "./statement";

export function texEscape(s: string): string {
  return s
    .replace(/[  ]/g, " ")
    // emojis / caractères hors plan de base : non supportés par pdflatex
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "?")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\&%$#_{}~^]/g, (c) => {
      switch (c) {
        case "\\":
          return "\\textbackslash{}";
        case "~":
          return "\\textasciitilde{}";
        case "^":
          return "\\textasciicircum{}";
        default:
          return "\\" + c;
      }
    });
}

/** cents -> "1\,234,56~\$" (LaTeX) */
export function texMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\\,");
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${sign}${whole},${frac}~\\$`;
}

export function renderTex(s: Statement): string {
  const [a, b] = s.members;
  const title =
    s.members.length === 2
      ? `Entre ${texEscape(a.name)} et ${texEscape(b.name)}`
      : s.members.length > 2
        ? `Groupe : ${s.members.map((m) => texEscape(m.name)).join(", ")}`
        : "Compte partagé";

  const rows = s.txs
    .map(
      (t) =>
        `${t.occurred_on} & ${texEscape(t.description)} & ${t.kind === "expense" ? "Dépense" : t.kind === "opening" ? "Solde" : "Remb."} & ${texEscape(
          t.payer_name,
        )} & ${texMoney(t.amount_cents)} & ${texMoney(t.other_share_cents)} \\\\`,
    )
    .join("\n");

  const totals = s.totals
    .map(
      (t) =>
        `\\item ${texEscape(t.member.name)} : dépenses payées ${texMoney(t.expensesPaid)}, remboursements versés ${texMoney(t.repaid)}`,
    )
    .join("\n");

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[french]{babel}
\\usepackage[margin=2cm]{geometry}
\\usepackage{longtable,booktabs,array}
\\usepackage{xcolor}
\\setlength{\\parindent}{0pt}

\\begin{document}

{\\LARGE\\bfseries État des comptes}\\\\[4pt]
{\\large ${title}}\\\\[2pt]
{\\small\\color{gray} Généré le ${texEscape(s.generatedAt)} par ${texEscape(s.generatedBy)}}

\\bigskip
\\fcolorbox{blue!30}{blue!5}{\\parbox{\\dimexpr\\linewidth-2\\fboxsep-2\\fboxrule}{\\bfseries ${texEscape(s.sentence)}}}

\\medskip
\\begin{itemize}
${totals}
\\end{itemize}

\\bigskip
\\small
\\begin{longtable}{@{}l p{5.2cm} l l r r@{}}
\\toprule
\\textbf{Date} & \\textbf{Description} & \\textbf{Type} & \\textbf{Payé par} & \\textbf{Montant} & \\textbf{Dette générée} \\\\
\\midrule
\\endhead
\\bottomrule
\\endfoot
${rows || "\\multicolumn{6}{l}{Aucune transaction.} \\\\"}
\\end{longtable}

\\end{document}
`;
}
