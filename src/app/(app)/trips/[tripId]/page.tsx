import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { TripClientView } from "./TripClientView"
import type { GeoJSON } from "geojson"

// ── Auto-geocode transit segments that are missing a geojson trace ────────────

async function geocode(place: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`,
      { headers: { "User-Agent": "Senchy/1.0 (contact@senchy.app)" }, next: { revalidate: 0 } }
    )
    const data = await res.json() as Array<{ lat: string; lon: string }>
    if (!data[0]) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

async function healTransitSegments(
  segments: Array<{ id: string; type: string; origin: string | null; destination: string | null; geojson: unknown }>
) {
  const toHeal = segments.filter(
    (s) => s.type !== "gpx" && !s.geojson && s.origin && s.destination
  )
  if (toHeal.length === 0) return

  await Promise.allSettled(
    toHeal.map(async (seg) => {
      const fromCoords = await geocode(seg.origin!)
      const toCoords   = await geocode(seg.destination!)
      if (!fromCoords || !toCoords) return
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[fromCoords.lon, fromCoords.lat], [toCoords.lon, toCoords.lat]] },
        }],
      }
      await db.segment.update({
        where: { id: seg.id },
        data: { geojson: geojson as object, startLat: fromCoords.lat, startLon: fromCoords.lon },
      })
    })
  )
}

interface PageProps {
  params: { tripId: string }
}

export async function generateMetadata({ params }: PageProps) {
  const trip = await db.trip.findUnique({ where: { id: params.tripId }, select: { name: true } })
  return { title: trip?.name ?? "Voyage" }
}

export default async function TripDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  // NB: on sélectionne uniquement les champs nécessaires. En particulier on
  // exclut `gpxRaw` (GPX brut, jamais envoyé au client — servi à part par
  // /api/segments/[id]/gpx) et `coverImageUrl` (non utilisé ici) : sinon la
  // réponse dépasse la limite de 5 Mo d'Accelerate sur les gros voyages.
  const trip = await db.trip.findUnique({
    where: { id: params.tripId },
    select: {
      id:          true,
      userId:      true,
      name:        true,
      type:        true,
      description: true,
      stopovers: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, sortOrder: true, date: true, endDate: true,
          name: true, place: true, notes: true, platform: true, link: true,
        },
      },
      segments: {
        orderBy: { sortOrder: "asc" },
        // uniquement ce dont healTransitSegments a besoin
        select: { id: true, type: true, origin: true, destination: true, geojson: true },
      },
    },
  })

  if (!trip) notFound()
  if (trip.userId !== session.user.id) notFound()

  // Silently heal transit segments that were created without a geojson trace
  await healTransitSegments(trip.segments)

  // Re-fetch after potential healing so geojson fields are fresh
  const healedSegments = await db.segment.findMany({
    where: { tripId: params.tripId },
    orderBy: { sortOrder: "asc" },
    // gpxRaw exclu (volumineux → limite Accelerate) ; notes inclus (court, utile pour les visites)
    select: {
      id: true, type: true, name: true, geojson: true,
      distanceM: true, elevationGainM: true, elevationLossM: true,
      elevationPoints: true, durationMin: true, departureAt: true,
      arrivalAt: true, origin: true, destination: true,
      startLat: true, startLon: true, komootUrl: true, notes: true,
    },
  })

  const totalDistanceM  = healedSegments.reduce((s, seg) => s + (seg.distanceM      ?? 0), 0)
  const totalElevGainM  = healedSegments.reduce((s, seg) => s + (seg.elevationGainM ?? 0), 0)
  const totalElevLossM  = healedSegments.reduce((s, seg) => s + (seg.elevationLossM ?? 0), 0)

  const segments = healedSegments.map((s) => ({
    id:              s.id,
    type:            s.type,
    name:            s.name,
    geojson:         s.geojson ? (s.geojson as unknown as GeoJSON.FeatureCollection) : null,
    distanceM:       s.distanceM,
    elevationGainM:  s.elevationGainM,
    elevationLossM:  s.elevationLossM,
    elevationPoints: (s.elevationPoints ?? null) as Array<{ distanceM: number; elevationM: number }> | null,
    durationMin:     s.durationMin,
    departureAt:     s.departureAt ? s.departureAt.toISOString() : null,
    arrivalAt:       s.arrivalAt   ? s.arrivalAt.toISOString()   : null,
    origin:          s.origin,
    destination:     s.destination,
    startLat:        s.startLat,
    startLon:        s.startLon,
    komootUrl:       s.komootUrl ?? null,
    notes:           s.notes ?? null,
  }))

  const stopovers = trip.stopovers.map((s) => ({
    id:        s.id,
    sortOrder: s.sortOrder,
    date:      s.date.toISOString(),
    endDate:   s.endDate ? s.endDate.toISOString() : null,
    name:      s.name ?? null,
    place:     s.place ?? null,
    notes:     s.notes,
    platform:  (s.platform as "booking" | "airbnb" | null) ?? null,
    link:      s.link ?? null,
  }))

  return (
    <TripClientView
      tripId={trip.id}
      tripName={trip.name}
      tripType={trip.type === "roadtrip" ? "roadtrip" : "biketrip"}
      tripDescription={trip.description}
      segments={segments}
      initialStopovers={stopovers}
      totalDistanceM={totalDistanceM}
      totalElevGainM={totalElevGainM}
      totalElevLossM={totalElevLossM}
    />
  )
}
