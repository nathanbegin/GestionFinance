import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import AuthHeader from "@/components/AuthHeader";
import AuthForm from "@/components/AuthForm";

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  return (
    <main className="center stack">
      <AuthHeader subtitle="Connectez-vous à votre compte partagé" />
      <AuthForm mode="login" />
      <p className="muted">
        Pas encore de compte ? <Link href="/register">Créer un compte</Link>
      </p>
    </main>
  );
}
