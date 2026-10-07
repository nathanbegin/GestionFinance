import Link from "next/link";
import { deleteTransaction } from "@/app/actions";
import { formatMoney } from "@/lib/money";
import type { Attachment, Member, Tx } from "@/lib/ledger";
import type { Supplier } from "@/lib/suppliers";
import DeleteButton from "./DeleteButton";
import SupplierLogo from "./SupplierLogo";

const KIND_LABEL = { expense: "Dépense", repayment: "Remboursement", opening: "Solde de départ" } as const;

export default function TxList({
  txs,
  userId,
  other,
  members = [],
  attachments,
  suppliers,
  empty = "Aucune transaction pour l'instant.",
}: {
  txs: Tx[];
  userId: number;
  other?: Member;
  /** Participants du compte (pour détailler les parts d'un groupe). */
  members?: Member[];
  attachments: Map<number, Attachment[]>;
  suppliers: Supplier[];
  empty?: string;
}) {
  if (!txs.length)
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          {empty}
        </p>
      </div>
    );
  return (
    <div className="card">
      {txs.map((t) => {
        const files = attachments.get(t.id) ?? [];
        const logos = suppliers.filter((s) => t.supplier_ids.includes(s.id));
        return (
          <div className="tx" key={t.id}>
            {logos.length > 0 && (
              <div className="tx-logos">
                {logos.map((s) => (
                  <SupplierLogo key={s.id} s={s} size={32} />
                ))}
              </div>
            )}
            <div className="tx-main">
              <div className="tx-title">
                {t.description}
                <span className="badge">{KIND_LABEL[t.kind]}</span>
                {t.invoice_number && <span className="badge">Fact. {t.invoice_number}</span>}
              </div>
              <div className="muted">
                {t.kind === "expense" ? "Payé par" : t.kind === "opening" ? "Dû à" : "Remboursé par"}{" "}
                {t.paid_by === userId ? "vous" : t.payer_name} ·{" "}
                {t.occurred_on}
                {members.length > 2
                  ? t.shares.length > 0 &&
                    ` · ${t.kind === "expense" ? "parts" : t.kind === "repayment" ? "remboursé à" : "dû par"} : ${t.shares
                      .map((x) => {
                        const n = x.user_id === userId ? "vous" : (members.find((m) => m.id === x.user_id)?.name ?? "?");
                        return t.kind === "expense" ? `${n} ${formatMoney(x.share_cents)}` : n;
                      })
                      .join(", ")}`
                  : t.kind === "expense" &&
                    ` · part de ${t.paid_by === userId ? (other?.name ?? "l'autre") : "vous"} : ${formatMoney(t.other_share_cents)}`}
              </div>
              {files.length > 0 && (
                <div className="tx-files">
                  {files.map((a) => (
                    <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" title={a.filename}>
                      {a.content_type === "application/pdf" ? "📄" : "🖼️"} {a.filename}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="right">
              <strong>{formatMoney(t.amount_cents)}</strong>
              <div className="actions">
                <Link href={`/modifier/${t.id}`}>Modifier</Link>
                {t.created_by === userId && (
                  <form action={deleteTransaction}>
                    <input type="hidden" name="id" value={t.id} />
                    <DeleteButton />
                  </form>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
