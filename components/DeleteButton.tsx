"use client";

export default function DeleteButton() {
  return (
    <button
      className="link danger"
      onClick={(e) => {
        if (!confirm("Supprimer cette transaction ? Elle restera visible dans l'historique.")) e.preventDefault();
      }}
    >
      Supprimer
    </button>
  );
}
