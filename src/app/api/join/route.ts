import { z } from "zod"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

const schema = z.object({ token: z.string().min(1) })

// ─── POST /api/join — rejoindre un voyage via un jeton de partage ─────────────
export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    const body: unknown = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: "Jeton manquant" }, { status: 400 })
    }

    const trip = await db.trip.findUnique({
      where: { shareToken: parsed.data.token },
      select: { id: true, userId: true },
    })

    if (!trip) {
      return Response.json({ error: "Lien de partage invalide ou désactivé." }, { status: 404 })
    }

    // Le propriétaire n'a pas besoin de « rejoindre ».
    if (trip.userId === user.id) {
      return Response.json({ tripId: trip.id, alreadyMember: true })
    }

    // Idempotent : ne rien faire si déjà collaborateur.
    await db.tripCollaborator.upsert({
      where: { tripId_userId: { tripId: trip.id, userId: user.id } },
      update: {},
      create: { tripId: trip.id, userId: user.id },
    })

    return Response.json({ tripId: trip.id })
  } catch (e) {
    console.error("[POST /api/join]", e)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
