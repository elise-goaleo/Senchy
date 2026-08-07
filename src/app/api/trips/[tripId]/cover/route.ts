import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { userHasTripAccess } from "@/lib/ownership"

interface RouteContext {
  params: { tripId: string }
}

// ─── GET /api/trips/[tripId]/cover — sert la photo de couverture ──────────────
// La couverture est stockée en base64 (data URI) dans la colonne `coverImageUrl`.
// On la sert ici, une par requête, plutôt que de la charger dans la requête du
// dashboard (qui, cumulée sur tous les voyages, dépasse la limite de 5 Mo
// d'Accelerate). Un cover absent — ou trop volumineux pour Accelerate — renvoie
// 404, ce qui déclenche l'image de repli côté carte.
export async function GET(_req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()
  if (!(await userHasTripAccess(params.tripId, user.id))) {
    return new Response(null, { status: 404 })
  }

  let uri: string | null = null
  try {
    const trip = await db.trip.findUnique({
      where: { id: params.tripId },
      select: { coverImageUrl: true },
    })
    uri = trip?.coverImageUrl ?? null
  } catch {
    // Réponse Accelerate > 5 Mo (cover très lourd) → traité comme absent.
    return new Response(null, { status: 404 })
  }

  const match = uri?.match(/^data:([^;]+);base64,([\s\S]*)$/)
  if (!match) return new Response(null, { status: 404 })

  const buf = Buffer.from(match[2], "base64")
  return new Response(buf, {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "private, max-age=3600",
    },
  })
}
