import { z } from "zod"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

// ─── Schema ───────────────────────────────────────────────────────────────────

const createTripSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
})

// ─── GET /api/trips ───────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    const trips = await db.trip.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { segments: true } },
        segments: {
          select: { distanceM: true },
        },
      },
    })

    const result = trips.map((trip) => {
      const { segments, ...rest } = trip
      const totalDistanceM = segments.reduce(
        (sum, s) => sum + (s.distanceM ?? 0),
        0
      )
      return { ...rest, totalDistanceM }
    })

    return Response.json(result)
  } catch (error) {
    console.error("[GET /api/trips]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── POST /api/trips ──────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    const body: unknown = await request.json()
    const parsed = createTripSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const trip = await db.trip.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        description: parsed.data.description,
      },
    })

    return Response.json(trip, { status: 201 })
  } catch (error) {
    console.error("[POST /api/trips]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
