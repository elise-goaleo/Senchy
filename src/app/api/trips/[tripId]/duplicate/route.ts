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

  // Métadonnées du voyage + étapes (léger) — SANS coverImageUrl ni champs
  // lourds des segments (sinon réponse Accelerate > 5 Mo sur les gros voyages).
  const original = await db.trip.findUnique({
    where: { id: params.tripId },
    select: {
      name: true, description: true, startDate: true, endDate: true, coverImagePosition: true,
      stopovers: true,
      segments: { orderBy: { sortOrder: "asc" }, select: { id: true } },
    },
  })

  if (!original) {
    return Response.json({ error: "Voyage introuvable." }, { status: 404 })
  }

  // Couverture lue à part et tolérante : un cover > 5 Mo n'empêche pas la copie
  // (elle sera simplement absente de la copie).
  let coverImageUrl: string | null = null
  try {
    coverImageUrl =
      (await db.trip.findUnique({ where: { id: params.tripId }, select: { coverImageUrl: true } }))
        ?.coverImageUrl ?? null
  } catch {
    coverImageUrl = null
  }

  // Données lourdes des segments : UNE requête par segment (chacune < 5 Mo),
  // pour ne jamais dépasser la limite Accelerate en une seule réponse.
  const segData = await Promise.all(
    original.segments.map((seg) =>
      db.segment.findUnique({
        where: { id: seg.id },
        select: {
          sortOrder: true, type: true, name: true, gpxRaw: true, geojson: true,
          distanceM: true, elevationGainM: true, elevationLossM: true, elevationPoints: true,
          startLat: true, startLon: true, origin: true, destination: true,
          durationMin: true, departureAt: true, arrivalAt: true, notes: true, komootUrl: true,
        },
      })
    )
  )

  // Create duplicated trip + all its segments and stopovers in one transaction
  const duplicated = await db.$transaction(
    async (tx) => {
      const newTrip = await tx.trip.create({
        data: {
          userId:              user.id,
          name:                `${original.name} (copie)`,
          description:         original.description,
          startDate:           original.startDate,
          endDate:             original.endDate,
          coverImageUrl,
          coverImagePosition:  original.coverImagePosition,
        },
        select: { id: true, name: true }, // pas de coverImageUrl dans la réponse
      })

      // Duplicate segments (preserve all GPX data, stats, type, etc.)
      const segs = segData.filter((s): s is NonNullable<typeof s> => s != null)
      if (segs.length > 0) {
        await tx.segment.createMany({
          data: segs.map((s) => ({
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
    },
    { timeout: 20000 }
  )

  return Response.json(duplicated, { status: 201 })
}
