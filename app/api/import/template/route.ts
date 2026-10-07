import { requireUser } from "@/lib/auth";
import { getMembers, todayLocal } from "@/lib/ledger";
import { buildTemplate } from "@/lib/importXlsx";
import { listSuppliers } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  const members = await getMembers(user.ledger_id);
  const suppliers = await listSuppliers(user.ledger_id);
  const buf = await buildTemplate(members, todayLocal(), suppliers.map((s) => s.name));
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modele-import-depenses.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
