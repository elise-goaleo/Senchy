import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { requireTripAccess } from "@/lib/ownership"

interface RouteContext {
  params: { tripId: string }
}

// ─── GET /api/trips/[tripId]/share — état du partage + collaborateurs ─────────
export async function GET(_req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripAccess(params.tripId, user.id)

    const trip = await db.trip.findUnique({
      where: { id: params.tripId },
      select: {
        shareToken: true,
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        collaborators: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            userId: true,
            user: { select: { name: true, email: true, avatarUrl: true } },
          },
        },
      },
    })
    if (!trip) return Response.json({ error: "Trip not found" }, { status: 404 })

    return Response.json({
      shareToken: trip.shareToken,
      currentUserId: user.id,
      owner: trip.user,
      collaborators: trip.collaborators.map((c) => ({
        id: c.id,
        userId: c.userId,
        name: c.user.name,
        email: c.user.email,
        avatarUrl: c.user.avatarUrl,
      })),
    })
  } catch (e) {
    if (e instanceof Response) return e
    console.error("[GET /api/trips/:id/share]", e)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── POST /api/trips/[tripId]/share — active le lien (génère un jeton) ────────
export async function POST(_req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    const trip = await requireTripAccess(params.tripId, user.id)

    let token = trip.shareToken
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "")
      await db.trip.update({
        where: { id: params.tripId },
        data: { shareToken: token },
      })
    }

    return Response.json({ shareToken: token })
  } catch (e) {
    if (e instanceof Response) return e
    console.error("[POST /api/trips/:id/share]", e)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── DELETE /api/trips/[tripId]/share — désactive le lien ─────────────────────
export async function DELETE(_req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripAccess(params.tripId, user.id)
    await db.trip.update({
      where: { id: params.tripId },
      data: { shareToken: null },
    })
    return Response.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error("[DELETE /api/trips/:id/share]", e)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
