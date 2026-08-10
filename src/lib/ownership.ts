import { db } from "@/lib/db"

/**
 * Condition Prisma « l'utilisateur a accès à ce voyage » :
 * il en est le propriétaire OU un collaborateur.
 * À utiliser dans les `where` de listes/recherches (dashboard, etc.).
 */
export function tripAccessWhere(userId: string) {
  return {
    OR: [
      { userId },
      { collaborators: { some: { userId } } },
    ],
  }
}

/**
 * Récupère un voyage et vérifie que l'utilisateur y a accès
 * (propriétaire OU collaborateur — les deux ont les pleins droits).
 *
 * @throws Response 404 si le voyage n'existe pas.
 * @throws Response 403 si l'utilisateur n'y a pas accès.
 */
export async function requireTripOwnership(
  tripId: string,
  userId: string
) {
  // `select` minimal : surtout PAS `coverImageUrl` (image base64, plusieurs Mo)
  // — sinon la réponse Accelerate dépasse 5 Mo et TOUTE opération (upload de
  // segment, étape, POI…) sur un voyage à couverture volumineuse échoue.
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      userId: true,
      shareToken: true,
      collaborators: { where: { userId }, select: { id: true } },
    },
  })

  if (!trip) {
    throw Response.json({ error: "Trip not found" }, { status: 404 })
  }

  const isOwner = trip.userId === userId
  const isCollaborator = trip.collaborators.length > 0
  if (!isOwner && !isCollaborator) {
    throw Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const { collaborators: _collaborators, ...rest } = trip
  return rest
}

/** Alias explicite : « accès » (propriétaire ou collaborateur). */
export const requireTripAccess = requireTripOwnership

/**
 * Vérifie l'accès sans lever d'exception (pour les Server Components / pages).
 * Renvoie `true` si l'utilisateur est propriétaire ou collaborateur.
 */
export async function userHasTripAccess(
  tripId: string,
  userId: string
): Promise<boolean> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      userId: true,
      collaborators: { where: { userId }, select: { id: true } },
    },
  })
  if (!trip) return false
  return trip.userId === userId || trip.collaborators.length > 0
}
