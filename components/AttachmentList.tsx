import { deleteAttachment } from "@/app/actions";
import type { Attachment } from "@/lib/ledger";

const size = (n: number) => (n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} Ko` : `${(n / 1e6).toFixed(1)} Mo`);

/** Liste de pièces jointes (liens de téléchargement ; retrait réservé à l'auteur de l'envoi). */
export default function AttachmentList({
  items,
  userId,
  editable = true,
}: {
  items: Attachment[];
  userId: number;
  editable?: boolean;
}) {
  if (!items.length) return <p className="muted">Aucune pièce jointe.</p>;
  return (
    <div className="card">
      {items.map((a) => (
        <div className="file-chip" key={a.id}>
          <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener">
            {a.content_type === "application/pdf" ? "📄" : "🖼️"} {a.filename}{" "}
            <span className="muted">({size(a.size_bytes)})</span>
          </a>
          {editable && a.created_by === userId && (
            <form action={deleteAttachment}>
              <input type="hidden" name="id" value={a.id} />
              <button className="link danger">Retirer</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
