import { requireUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import QueuePanel from "@/components/QueuePanel";

export const metadata = { title: "Liste d'attente" };

export default async function QueuePage() {
  const user = await requireUser({ allowNone: true });
  return (
    <>
      <Nav name={user.name} />
      <main>
        <h1>Liste d&apos;attente</h1>
        <QueuePanel userId={user.id} />
      </main>
    </>
  );
}
