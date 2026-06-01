import { z } from "zod"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { requireTripOwnership } from "@/lib/ownership"

// ─── Schema ───────────────────────────────────────────────────────────────────

const createPoiSchema = z.object({
  tripId: z.string().min(1),
  category: z.enum(["supermarket", "toilet", "sight", "custom"]),
  name: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  osmId: z.number().int().optional(),
  notes: z.string().max(2000).optional(),
})

// ─── GET /api/pois?tripId=xxx ─────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const tripId = searchParams.get("tripId")

  if (!tripId) {
    return Response.json({ error: "tripId query parameter is required" }, { status: 400 })
  }

  try {
    await requireTripOwnership(tripId, user.id)

    const pois = await db.poi.findMany({
      where: { tripId },
      orderBy: { createdAt: "asc" },
    })

    // Serialize BigInt osmId as string to avoid JSON issues
    const serialized = pois.map((p) => ({
      ...p,
      osmId: p.osmId !== null ? p.osmId.toString() : null,
    }))

    return Response.json(serialized)
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[GET /api/pois]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── POST /api/pois ───────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    const body: unknown = await request.json()
    const parsed = createPoiSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { tripId, category, name, lat, lon, osmId, notes } = parsed.data

    await requireTripOwnership(tripId, user.id)

    const poi = await db.poi.create({
      data: {
        tripId,
        category,
        name: name ?? null,
        lat,
        lon,
        osmId: osmId !== undefined ? BigInt(osmId) : null,
        notes: notes ?? null,
      },
    })

    return Response.json(
      { ...poi, osmId: poi.osmId !== null ? poi.osmId.toString() : null },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[POST /api/pois]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
