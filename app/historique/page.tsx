import { requireUser } from "@/lib/auth";
import { auditText, listAudit } from "@/lib/audit";
import Nav from "@/components/Nav";

const fmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Toronto",
});

export default async function HistoryPage() {
  const user = await requireUser();
  const rows = await listAudit(user.ledger_id);
  return (
    <>
      <Nav name={user.name} />
      <main>
        <h1>Historique des modifications</h1>
        <div className="card">
          {rows.length === 0 && <p className="muted">Aucune activité.</p>}
          {rows.map((r) => {
            const { verb, lines } = auditText(r);
            return (
              <div className="audit" key={r.id}>
                <div>
                  <strong>{r.user_name}</strong> {verb}
                </div>
                <div className="muted">{fmt.format(new Date(r.created_at))}</div>
                {lines.length > 0 && (
                  <ul>
                    {lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
