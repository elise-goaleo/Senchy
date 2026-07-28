import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { requireTripAccess } from "@/lib/ownership"

interface RouteContext {
  params: { tripId: string; collaboratorId: string }
}

// ─── DELETE /api/trips/[tripId]/collaborators/[collaboratorId] ────────────────
// Retire un collaborateur du voyage. Accessible aux membres (propriétaire ou
// collaborateur), ce qui permet aussi à un collaborateur de se retirer lui-même.
export async function DELETE(_req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripAccess(params.tripId, user.id)

    const collaborator = await db.tripCollaborator.findUnique({
      where: { id: params.collaboratorId },
      select: { id: true, tripId: true },
    })

    if (!collaborator || collaborator.tripId !== params.tripId) {
      return Response.json({ error: "Collaborator not found" }, { status: 404 })
    }

    await db.tripCollaborator.delete({ where: { id: collaborator.id } })
    return Response.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error("[DELETE /api/trips/:id/collaborators/:cid]", e)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
