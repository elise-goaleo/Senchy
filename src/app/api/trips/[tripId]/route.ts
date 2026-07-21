import { z } from "zod"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { requireTripOwnership } from "@/lib/ownership"

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

// ─── Schema ───────────────────────────────────────────────────────────────────

const updateTripSchema = z.object({
  name:                z.string().min(1).max(200).optional(),
  description:         z.string().max(2000).nullable().optional(),
  startDate:           z.string().nullable().optional(), // "YYYY-MM-DD"
  endDate:             z.string().nullable().optional(),
  coverImagePosition:  z.string().max(20).nullable().optional(), // "X% Y%"
})

// ─── Route params ─────────────────────────────────────────────────────────────

interface RouteContext {
  params: { tripId: string }
}

// ─── GET /api/trips/[tripId] ──────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripOwnership(params.tripId, user.id)

    const trip = await db.trip.findUnique({
      where: { id: params.tripId },
      include: {
        segments: { orderBy: { sortOrder: "asc" } },
        pois: { orderBy: { createdAt: "asc" } },
      },
    })

    return Response.json(trip)
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[GET /api/trips/[tripId]]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── PATCH /api/trips/[tripId] ────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripOwnership(params.tripId, user.id)

    const contentType = request.headers.get("content-type") ?? ""

    // ── Image upload (multipart) ─────────────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const file = formData.get("cover")

      if (!(file instanceof Blob)) {
        return Response.json({ error: "Image manquante" }, { status: 400 })
      }
      if (file.size > MAX_IMAGE_SIZE) {
        return Response.json({ error: "Image trop volumineuse (max 5 Mo)" }, { status: 413 })
      }

      // Stockage en data URL (base64) directement en base — compatible hébergement serverless
      const mime = file.type || "image/jpeg"
      const coverImageUrl = `data:${mime};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`

      const trip = await db.trip.update({
        where: { id: params.tripId },
        data: { coverImageUrl },
      })
      return Response.json(trip)
    }

    // ── JSON metadata ────────────────────────────────────────────────────────
    const body: unknown = await request.json()
    const parsed = updateTripSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { name, description, startDate, endDate, coverImagePosition } = parsed.data

    const trip = await db.trip.update({
      where: { id: params.tripId },
      data: {
        ...(name                !== undefined && { name }),
        ...(description         !== undefined && { description }),
        ...(coverImagePosition  !== undefined && { coverImagePosition }),
        ...(startDate           !== undefined && {
          startDate: startDate ? new Date(startDate + "T12:00:00Z") : null,
        }),
        ...(endDate             !== undefined && {
          endDate: endDate ? new Date(endDate + "T12:00:00Z") : null,
        }),
      },
    })

    return Response.json(trip)
  } catch (error) {
    if (error instanceof Response) return error
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[PATCH /api/trips/[tripId]]", error)
    return Response.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/trips/[tripId] ───────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripOwnership(params.tripId, user.id)

    await db.trip.delete({ where: { id: params.tripId } })

    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[DELETE /api/trips/[tripId]]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
