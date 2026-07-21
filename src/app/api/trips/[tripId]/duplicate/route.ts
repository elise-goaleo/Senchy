import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { requireTripOwnership } from "@/lib/ownership"

export async function POST(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await requireTripOwnership(params.tripId, user.id)
  } catch (err) {
    if (err instanceof Response) return err
    throw err
  }

  // Fetch full trip with all related data
  const original = await db.trip.findUnique({
    where: { id: params.tripId },
    include: {
      segments:  true,
      stopovers: true,
    },
  })

  if (!original) {
    return Response.json({ error: "Voyage introuvable." }, { status: 404 })
  }

  // Create duplicated trip + all its segments and stopovers in one transaction
  const duplicated = await db.$transaction(async (tx) => {
    const newTrip = await tx.trip.create({
      data: {
        userId:              user.id,
        name:                `${original.name} (copie)`,
        description:         original.description,
        startDate:           original.startDate,
        endDate:             original.endDate,
        coverImageUrl:       original.coverImageUrl,
        coverImagePosition:  original.coverImagePosition,
      },
    })

    // Duplicate segments (preserve all GPX data, stats, type, etc.)
    if (original.segments.length > 0) {
      await tx.segment.createMany({
        data: original.segments.map((s) => ({
          tripId:          newTrip.id,
          sortOrder:       s.sortOrder,
          type:            s.type,
          name:            s.name,
          gpxRaw:          s.gpxRaw,
          geojson:         s.geojson ?? undefined,
          distanceM:       s.distanceM,
          elevationGainM:  s.elevationGainM,
          elevationLossM:  s.elevationLossM,
          elevationPoints: s.elevationPoints ?? undefined,
          startLat:        s.startLat,
          startLon:        s.startLon,
          origin:          s.origin,
          destination:     s.destination,
          durationMin:     s.durationMin,
          departureAt:     s.departureAt,
          arrivalAt:       s.arrivalAt,
          notes:           s.notes,
          komootUrl:       s.komootUrl,
        })),
      })
    }

    // Duplicate stopovers
    if (original.stopovers.length > 0) {
      await tx.stopover.createMany({
        data: original.stopovers.map((s) => ({
          tripId:    newTrip.id,
          sortOrder: s.sortOrder,
          date:      s.date,
          endDate:   s.endDate,
          name:      s.name,
          place:     s.place,
          notes:     s.notes,
          platform:  s.platform,
          link:      s.link,
        })),
      })
    }

    return newTrip
  })

  return Response.json(duplicated, { status: 201 })
}
