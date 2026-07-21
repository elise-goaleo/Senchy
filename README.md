# Senchy — Planificateur de voyages à vélo

Application web pour planifier des voyages à vélo : import de traces GPX, itinéraires multi-segments (vélo, voiture, train, à pied), profils altimétriques, nuits/hébergements sur carte, export Excel.

## Stack

- **Next.js 14** (App Router) + React + TypeScript
- **PostgreSQL** via **Prisma**
- **NextAuth** (authentification)
- **Leaflet** / react-leaflet (cartes, fonds OpenStreetMap / CartoDB)
- Services externes (gratuits, sans clé) : Nominatim & Photon (géocodage), OSRM (itinéraires voiture)

## Développement local

```bash
npm install
npm run dev            # http://localhost:3000
```

En cas d'affichage cassé après un arrêt brutal (CSS qui ne charge pas) :

```bash
rm -rf .next && npm run dev
```

### Variables d'environnement

Créer un fichier `.env.local` (ignoré par git) :

```bash
DATABASE_URL="postgresql://…"          # base PostgreSQL
NEXTAUTH_SECRET="…"                    # générer : openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"   # en local

# Optionnel — envoi des emails de réinitialisation de mot de passe.
# Sans ces variables, le lien de réinitialisation s'affiche dans les logs serveur.
SMTP_HOST="…"
SMTP_PORT="587"
SMTP_USER="…"
SMTP_PASS="…"
SMTP_FROM="Senchy <no-reply@exemple.com>"
```

### Base de données

```bash
npm run db:push        # applique le schéma Prisma à la base
npm run db:studio      # interface visuelle (Prisma Studio)
```

## Scripts

| Script | Rôle |
|--------|------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (`prisma generate` + `next build`) |
| `npm run start` | Sert le build de production |
| `npm run db:push` | Applique le schéma à la base |
| `npm run db:studio` | Prisma Studio |

## Déploiement (Vercel)

1. Pousser le dépôt sur GitHub.
2. Sur [vercel.com](https://vercel.com) : **Import Project** depuis GitHub.
3. Renseigner les variables d'environnement :

   | Variable | Valeur |
   |----------|--------|
   | `DATABASE_URL` | URL de la base PostgreSQL (cloud) |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | `https://<ton-app>.vercel.app` |
   | `SMTP_*` | (optionnel) pour les emails |

4. Déployer. Le build exécute automatiquement `prisma generate`.

> **Images** : les avatars et photos de couverture sont stockés en **base64 directement en base** (data URLs), pas sur le disque — compatible avec l'hébergement serverless (le système de fichiers y est en lecture seule).

## Licence

Projet personnel.
