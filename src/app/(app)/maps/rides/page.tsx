import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getOrCreateRidesTrip } from "@/lib/ridesMap"
import { RidesMapView, type RideTrace } from "./RidesMapView"
import type { GeoJSON } from "geojson"

export const metadata = { title: "Mes sorties vélo" }

export default async function RidesMapPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const tripId = await getOrCreateRidesTrip(session.user.id)

  // On charge le geojson de chaque trace pour la carte, mais JAMAIS `gpxRaw`
  // (GPX brut, plusieurs Mo → dépasserait la limite de réponse de 5 Mo
  // d'Accelerate). Le GPX brut est servi à part par /api/segments/[id]/gpx.
  const segments = await db.segment.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, geojson: true,
      distanceM: true, elevationGainM: true, createdAt: true,
    },
  })

  const traces: RideTrace[] = segments.map((s) => ({
    id:             s.id,
    name:           s.name,
    geojson:        (s.geojson as unknown as GeoJSON.FeatureCollection | null) ?? null,
    distanceM:      s.distanceM,
    elevationGainM: s.elevationGainM,
    createdAt:      s.createdAt.toISOString(),
  }))

  return <RidesMapView tripId={tripId} initialTraces={traces} />
}
