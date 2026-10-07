"use client";

import { useActionState } from "react";
import { changePassword, updateName } from "@/app/actions";

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateName, undefined);
  return (
    <form action={action} className="card stack">
      <label>
        Votre nom affiché
        <input name="name" required maxLength={60} defaultValue={name} />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="ok">{state.ok}</p>}
      <button disabled={pending}>Enregistrer</button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="card stack">
      <label>
        Mot de passe actuel
        <input name="current" type="password" required autoComplete="current-password" />
      </label>
      <label>
        Nouveau mot de passe (8 caractères min.)
        <input name="next" type="password" required minLength={8} autoComplete="new-password" />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="ok">{state.ok}</p>}
      <button disabled={pending}>Changer le mot de passe</button>
    </form>
  );
}
