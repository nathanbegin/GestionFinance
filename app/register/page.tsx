import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  if (await getUser()) redirect("/");
  const { invite } = await searchParams;
  return (
    <main className="center stack">
      <h1>Créer un compte</h1>
      <AuthForm mode="register" invite={invite ?? ""} />
      <p className="muted">
        Déjà un compte ? <Link href="/login">Se connecter</Link>
      </p>
    </main>
  );
}
