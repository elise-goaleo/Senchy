# Senchy — Planificateur de voyages à vélo

Application web pour planifier des voyages à vélo : import de traces GPX, itinéraires multi-segments (vélo, voiture, train, à pied), profils altimétriques, nuits/hébergements sur carte, export Excel.

## Stack

- **Next.js 14** (App Router) + React + TypeScript
- **Prisma Postgres** via **Prisma** + **Accelerate** (connexion HTTP, compatible serverless)
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
# Base = Prisma Postgres via Accelerate (connexion HTTP, marche en local ET sur Vercel)
DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=…"
# Connexion DIRECTE à la même base — utilisée uniquement par les migrations/studio en local
DIRECT_URL="postgres://…@db.prisma.io:5432/postgres?sslmode=require"

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
npm run db:push        # applique le schéma Prisma à la base (via DIRECT_URL)
npm run db:studio      # interface visuelle (Prisma Studio, via DIRECT_URL)
```

> Les commandes de schéma (`db:push`, `studio`) utilisent `DIRECT_URL` (connexion directe).
> Le code de l'application (runtime) utilise `DATABASE_URL` (Accelerate).

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
3. Renseigner les variables d'environnement (Production) :

   | Variable | Valeur |
   |----------|--------|
   | `DATABASE_URL` | **URL Accelerate** : `prisma+postgres://accelerate.prisma-data.net/?api_key=…` |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | `https://<ton-app>.vercel.app` (ex. `https://senchy.vercel.app`) |
   | `SMTP_*` | (optionnel) pour les emails |

   > ⚠️ Sur Vercel (serverless), **il faut l'URL Accelerate** (`prisma+postgres://…`), **pas**
   > la connexion directe `postgres://…@db.prisma.io` : celle-ci n'est pas joignable depuis Vercel.
   > `DIRECT_URL` n'est **pas** nécessaire sur Vercel (aucune migration n'y est lancée).

4. Déployer. Chaque `git push` sur `main` redéclenche automatiquement le déploiement. Le build exécute `prisma generate`.

### Où trouver l'URL Accelerate

Sur [console.prisma.io](https://console.prisma.io) → ta base → **Connection strings** →
**Create connection string** → copie l'URL complète (`prisma+postgres://…?api_key=…`).
⚠️ La clé n'est affichée **qu'une seule fois** à sa création.

> **Images** : les avatars et photos de couverture sont stockés en **base64 directement en base** (data URLs), pas sur le disque — compatible avec l'hébergement serverless (le système de fichiers y est en lecture seule).

## Licence

Projet personnel.
