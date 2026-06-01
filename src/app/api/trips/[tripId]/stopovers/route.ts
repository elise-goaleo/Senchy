import { z } from "zod"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { requireTripOwnership } from "@/lib/ownership"

interface RouteContext { params: { tripId: string } }

const createSchema = z.object({
  date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  name:     z.string().max(300).nullable().optional(),
  place:    z.string().max(500).nullable().optional(),
  notes:    z.string().max(1000).nullable().optional(),
  platform: z.enum(["booking", "airbnb"]).nullable().optional(),
  link:     z.string().url().nullable().optional(),
})

const reorderSchema = z.object({
  order: z.array(z.string()),
})

// ── GET /api/trips/[tripId]/stopovers ─────────────────────────────────────────

export async function GET(_req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripOwnership(params.tripId, user.id)
    const stopovers = await db.stopover.findMany({
      where:   { tripId: params.tripId },
      orderBy: { sortOrder: "asc" },
    })
    return Response.json(stopovers)
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[GET stopovers]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── POST /api/trips/[tripId]/stopovers ────────────────────────────────────────

export async function POST(req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripOwnership(params.tripId, user.id)

    const body: unknown = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    // Assign sortOrder = current max + 1
    const last = await db.stopover.findFirst({
      where:   { tripId: params.tripId },
      orderBy: { sortOrder: "desc" },
      select:  { sortOrder: true },
    })
    const sortOrder = (last?.sortOrder ?? -1) + 1

    const { date, endDate, name, place, notes, platform, link } = parsed.data
    const stopover = await db.stopover.create({
      data: {
        tripId: params.tripId,
        sortOrder,
        date:     new Date(date + "T12:00:00Z"),
        endDate:  endDate ? new Date(endDate + "T12:00:00Z") : null,
        name:     name     ?? null,
        place:    place    ?? null,
        notes:    notes    ?? null,
        platform: platform ?? null,
        link:     link     ?? null,
      },
    })
    return Response.json(stopover, { status: 201 })
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[POST stopovers]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── PATCH /api/trips/[tripId]/stopovers  (reorder) ────────────────────────────

export async function PATCH(req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripOwnership(params.tripId, user.id)

    const body: unknown = await req.json()
    const parsed = reorderSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: "Validation failed" }, { status: 400 })
    }

    await db.$transaction(
      parsed.data.order.map((id, idx) =>
        db.stopover.update({ where: { id, tripId: params.tripId }, data: { sortOrder: idx } })
      )
    )
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[PATCH stopovers reorder]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
