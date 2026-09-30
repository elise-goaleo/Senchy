import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getOrCreateRidesTrip } from "@/lib/ridesMap"
import { RidesMapView, type RideTrace } from "./RidesMapView"
import type { GeoJSON } from "geojson"

export const metadata = { title: "Mes sorties vélo" }

// Nombre de points conservés par trace pour l'aperçu carte (pleine résolution
// inutile ici). Voir aussi la page détail d'un voyage, même stratégie.
const MAX_MAP_POINTS = 600

// Exécute `fn` sur chaque item avec une concurrence bornée (charge les champs
// lourds trace par trace sans saturer la limite de 5 Mo d'Accelerate).
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      await fn(items[idx])
    }
  })
  await Promise.all(workers)
}

function downsampleArray<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr
  const step = (arr.length - 1) / (max - 1)
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)])
  return out
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5

// Allège un tracé avant envoi au navigateur : ne garde que les lignes, supprime
// les `properties`, échantillonne et réduit à [lon, lat] à ~1 m près.
function slimGeojson(fc: GeoJSON.FeatureCollection, maxPerLine: number): GeoJSON.FeatureCollection {
  const lines = (fc.features ?? []).filter(
    (f) => f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")
  )
  return {
    type: "FeatureCollection",
    features: lines.map((f) => {
      const g = f.geometry as GeoJSON.LineString | GeoJSON.MultiLineString
      if (g.type === "LineString") {
        return {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: downsampleArray(g.coordinates, maxPerLine).map((c) => [round5(c[0]), round5(c[1])]),
          },
        }
      }
      return {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "MultiLineString" as const,
          coordinates: g.coordinates.map((l) => downsampleArray(l, maxPerLine).map((c) => [round5(c[0]), round5(c[1])])),
        },
      }
    }),
  }
}

export default async function RidesMapPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const tripId = await getOrCreateRidesTrip(session.user.id)

  // 1) Métadonnées légères de toutes les traces (SANS geojson ni gpxRaw) : la
  //    réponse reste très en-dessous de la limite de 5 Mo d'Accelerate.
  const metas = await db.segment.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, distanceM: true, elevationGainM: true, createdAt: true },
  })

  // 2) Le geojson est chargé TRACE PAR TRACE (concurrence bornée) puis allégé :
  //    une réponse Accelerate ne contient jamais qu'un seul tracé → jamais > 5 Mo,
  //    même avec beaucoup de sorties.
  const geoById = new Map<string, GeoJSON.FeatureCollection | null>()
  await mapLimit(metas, 6, async (m) => {
    const row = await db.segment.findUnique({ where: { id: m.id }, select: { geojson: true } })
    const raw = row?.geojson as unknown as GeoJSON.FeatureCollection | null
    geoById.set(m.id, raw ? slimGeojson(raw, MAX_MAP_POINTS) : null)
  })

  const traces: RideTrace[] = metas.map((s) => ({
    id:             s.id,
    name:           s.name,
    geojson:        geoById.get(s.id) ?? null,
    distanceM:      s.distanceM,
    elevationGainM: s.elevationGainM,
    createdAt:      s.createdAt.toISOString(),
  }))

  return <RidesMapView tripId={tripId} initialTraces={traces} />
}
