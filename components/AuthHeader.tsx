import Logo from "./Logo";

export default function AuthHeader({ subtitle }: { subtitle: string }) {
  return (
    <header className="auth-header">
      <Logo />
      <h1>Gestion des finances</h1>
      <p className="muted">{subtitle}</p>
    </header>
  );
}
