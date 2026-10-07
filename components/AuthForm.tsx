"use client";

import { useActionState } from "react";
import { login, register } from "@/app/actions";

export default function AuthForm({ mode, invite = "" }: { mode: "login" | "register"; invite?: string }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : register, undefined);
  return (
    <form action={action} className="card stack">
      {mode === "register" && (
        <label>
          Votre nom
          <input name="name" required maxLength={60} autoComplete="name" />
        </label>
      )}
      <label>
        Courriel
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Mot de passe
        <input
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {mode === "register" && (
        <label>
          Code d&apos;invitation <span className="muted">(laisser vide pour créer un nouveau compte partagé)</span>
          <input name="invite" defaultValue={invite} autoCapitalize="characters" />
        </label>
      )}
      {state?.error && <p className="error">{state.error}</p>}
      <button disabled={pending}>{mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
    </form>
  );
}
