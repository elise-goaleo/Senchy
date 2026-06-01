import { z } from "zod"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

// ─── Schema ───────────────────────────────────────────────────────────────────

const updatePoiSchema = z.object({
  category: z.enum(["supermarket", "toilet", "sight", "custom"]).optional(),
  name: z.string().max(300).nullable().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  notes: z.string().max(2000).nullable().optional(),
})

// ─── Route params ─────────────────────────────────────────────────────────────

interface RouteContext {
  params: { poiId: string }
}

// ─── Helper: resolve POI and verify ownership ─────────────────────────────────

async function resolvePoi(poiId: string, userId: string) {
  const poi = await db.poi.findUnique({
    where: { id: poiId },
    include: { trip: { select: { userId: true } } },
  })

  if (!poi) {
    throw Response.json({ error: "POI not found" }, { status: 404 })
  }

  if (poi.trip.userId !== userId) {
    throw Response.json({ error: "Forbidden" }, { status: 403 })
  }

  return poi
}

// ─── PATCH /api/pois/[poiId] ─────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await resolvePoi(params.poiId, user.id)

    const body: unknown = await request.json()
    const parsed = updatePoiSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = parsed.data

    const poi = await db.poi.update({
      where: { id: params.poiId },
      data: {
        ...(data.category !== undefined && { category: data.category }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.lat !== undefined && { lat: data.lat }),
        ...(data.lon !== undefined && { lon: data.lon }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    })

    return Response.json({
      ...poi,
      osmId: poi.osmId !== null ? poi.osmId.toString() : null,
    })
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[PATCH /api/pois/[poiId]]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── DELETE /api/pois/[poiId] ────────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await resolvePoi(params.poiId, user.id)

    await db.poi.delete({ where: { id: params.poiId } })

    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[DELETE /api/pois/[poiId]]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
