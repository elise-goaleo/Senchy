import { z } from "zod"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { requireTripOwnership } from "@/lib/ownership"

interface RouteContext { params: { tripId: string; stopovers: string } }

const updateSchema = z.object({
  date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  name:     z.string().max(300).nullable().optional(),
  place:    z.string().max(500).nullable().optional(),
  notes:    z.string().max(1000).nullable().optional(),
  platform: z.enum(["booking", "airbnb"]).nullable().optional(),
  link:     z.string().url().nullable().optional(),
})

// ── PATCH /api/trips/[tripId]/stopovers/[stopovers] ───────────────────────────

export async function PATCH(req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripOwnership(params.tripId, user.id)

    const body: unknown = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { date, endDate, name, place, notes, platform, link } = parsed.data
    const stopover = await db.stopover.update({
      where: { id: params.stopovers, tripId: params.tripId },
      data: {
        ...(date     !== undefined && { date: new Date(date + "T12:00:00Z") }),
        ...(endDate  !== undefined && { endDate: endDate ? new Date(endDate + "T12:00:00Z") : null }),
        ...(name     !== undefined && { name }),
        ...(place    !== undefined && { place }),
        ...(notes    !== undefined && { notes }),
        ...(platform !== undefined && { platform }),
        ...(link     !== undefined && { link }),
      },
    })
    return Response.json(stopover)
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[PATCH stopovers]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── DELETE /api/trips/[tripId]/stopovers/[stopovers] ──────────────────────────

export async function DELETE(_req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripOwnership(params.tripId, user.id)
    await db.stopover.delete({ where: { id: params.stopovers, tripId: params.tripId } })
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[DELETE stopovers]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
