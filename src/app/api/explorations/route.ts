import { z } from "zod"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { getOrCreateExplorationsTrip, parseExplorations } from "@/lib/ridesMap"

const explorationsSchema = z.object({
  countries: z.array(z.string().min(2).max(3)).max(300),
  cities: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        lat:  z.number().min(-90).max(90),
        lon:  z.number().min(-180).max(180),
      })
    )
    .max(2000),
})

// ─── GET /api/explorations ────────────────────────────────────────────────────
export async function GET(): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  const tripId = await getOrCreateExplorationsTrip(user.id)
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { description: true },
  })
  return Response.json(parseExplorations(trip?.description ?? null))
}

// ─── PUT /api/explorations ────────────────────────────────────────────────────
export async function PUT(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    const body: unknown = await request.json()
    const parsed = explorationsSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Déduplique les pays et borne les données stockées.
    const countries = Array.from(new Set(parsed.data.countries))
    const data = { countries, cities: parsed.data.cities }

    const tripId = await getOrCreateExplorationsTrip(user.id)
    await db.trip.update({
      where: { id: tripId },
      data:  { description: JSON.stringify(data) },
    })

    return Response.json(data)
  } catch (error) {
    console.error("[PUT /api/explorations]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
