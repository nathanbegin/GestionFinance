# Comptes partagés

Petite application web pour suivre les dépenses et remboursements entre deux personnes ou en groupe.

- Plusieurs comptes de dépenses : à deux (part due par l'autre, en %) ou de groupe (répartition en % entre tous les participants, définie à chaque transaction). Le créateur choisit les participants parmi les personnes inscrites.
- Dépenses et remboursements
- Solde automatique entre les deux participants
- Connexion par courriel + mot de passe, invitation de l'autre personne par code
- Historique complet des modifications (qui a fait quoi, quand, avant → après)
- Les suppressions sont logiques : une transaction supprimée reste visible dans l'historique
- Export PDF et export `.tex` (compilable avec pdflatex / lualatex / xelatex)

Stack : Next.js (App Router), Neon Postgres, `jose` + `bcryptjs`, `pdf-lib`.

## Fonctionnement des soldes

Chaque transaction stocke la part que **l'autre personne doit au payeur**.
Un remboursement est une transaction dont cette part vaut 100 % du montant.
Le solde de chacun est la somme de ce qu'on lui doit moins ce qu'il doit.

## Déploiement sur Vercel

1. Pousser le dossier dans un dépôt Git et l'importer dans Vercel.
2. Dans le projet Vercel : **Storage → Create → Neon (Postgres)**. La variable `DATABASE_URL` est ajoutée automatiquement.
3. Ajouter la variable `AUTH_SECRET` (au moins 32 caractères aléatoires : `openssl rand -base64 32`).
4. Créer les tables, une seule fois, depuis votre poste :
   ```bash
   vercel env pull .env.local
   npm install
   npm run db:migrate
   ```
5. Déployer. Créer votre compte sur `/register` (laisser le code vide), puis ouvrir **Comptes** pour créer un compte de dépenses avec une ou plusieurs personnes déjà inscrites.
6. Une fois tout le monde inscrit, définir `ALLOW_NEW_LEDGERS=false` dans Vercel pour interdire les inscriptions sans code d'invitation.

## Développement local

```bash
cp .env.example .env.local   # remplir DATABASE_URL et AUTH_SECRET
npm install
npm run db:migrate
npm run dev
```

## Notes

- Montants en dollars (CAD), fuseau horaire America/Toronto.
- L'export PDF utilise des polices standard : les caractères hors alphabet latin sont remplacés par `?`. Le `.tex` est la version fidèle pour la mise en forme finale.
- Pas de limitation de tentatives de connexion : à ajouter (par ex. avec le pare-feu Vercel) si l'adresse est publique.
