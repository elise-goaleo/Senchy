import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { userHasTripAccess } from "@/lib/ownership"
import { TripClientView } from "./TripClientView"
import type { GeoJSON } from "geojson"

// Exécute `fn` sur chaque item avec une concurrence bornée (pour charger les
// champs lourds segment par segment sans saturer Accelerate).
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

// Nombre de points conservés côté client. L'aperçu du voyage (carte + mini
// profil) n'a pas besoin de la pleine résolution ; la page détail d'un segment
// recharge, elle, les données complètes.
const MAX_MAP_POINTS = 800
const MAX_CHART_POINTS = 400

// Réduit un tableau à `max` éléments en conservant les extrémités (échantillonnage régulier).
function downsampleArray<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr
  const step = (arr.length - 1) / (max - 1)
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)])
  return out
}

// Réduit la résolution des tracés d'un FeatureCollection (LineString /
// MultiLineString) pour alléger le volume envoyé au navigateur.
function downsampleGeojson(fc: GeoJSON.FeatureCollection, maxPerLine: number): GeoJSON.FeatureCollection {
  return {
    ...fc,
    features: (fc.features ?? []).map((f) => {
      const g = f.geometry
      if (!g) return f
      if (g.type === "LineString") {
        return { ...f, geometry: { ...g, coordinates: downsampleArray(g.coordinates, maxPerLine) } }
      }
      if (g.type === "MultiLineString") {
        return { ...f, geometry: { ...g, coordinates: g.coordinates.map((l) => downsampleArray(l, maxPerLine)) } }
      }
      return f
    }),
  }
}

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
  segments: Array<{ id: string; type: string; origin: string | null; destination: string | null; geojson: unknown; showOnMap: boolean }>
) {
  const toHeal = segments.filter(
    // On ne « répare » pas un vol dont l'utilisateur a volontairement masqué le tracé
    (s) => s.type !== "gpx" && !s.geojson && s.origin && s.destination && s.showOnMap
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
  // Métadonnées légères de TOUS les segments : on exclut ici les champs lourds
  // (`geojson`, `elevationPoints`, `gpxRaw`) pour que cette réponse reste très
  // au-dessous de la limite de 5 Mo d'Accelerate, même sur un voyage qui
  // contient beaucoup de traces GPX.
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
          name: true, place: true, lat: true, lon: true, notes: true, platform: true, link: true,
        },
      },
      segments: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, type: true, name: true,
          distanceM: true, elevationGainM: true, elevationLossM: true,
          durationMin: true, departureAt: true, arrivalAt: true,
          origin: true, destination: true, startLat: true, startLon: true,
          komootUrl: true, notes: true, transportMode: true, terminal: true, showOnMap: true,
        },
      },
    },
  })

  if (!trip) notFound()
  if (!(await userHasTripAccess(trip.id, session.user.id))) notFound()

  // Présence d'un tracé pour les segments de transit (non-gpx) : leur geojson
  // est minuscule (une ligne à 2 points) → requête légère, sans risque de dépasser 5 Mo.
  const transitGeo = await db.segment.findMany({
    where: { tripId: params.tripId, type: { not: "gpx" } },
    select: { id: true, geojson: true },
  })
  const geoPresent = new Set(transitGeo.filter((s) => s.geojson).map((s) => s.id))

  // Répare silencieusement les segments de transit créés sans tracé.
  await healTransitSegments(
    trip.segments.map((s) => ({
      id: s.id, type: s.type, origin: s.origin, destination: s.destination,
      geojson: geoPresent.has(s.id) ? {} : null,
      showOnMap: s.showOnMap,
    }))
  )

  // Champs lourds chargés SEGMENT PAR SEGMENT, et `geojson` / `elevationPoints`
  // dans DEUX requêtes distinctes : ainsi une seule réponse Accelerate ne
  // contient jamais qu'un seul champ d'un seul segment → jamais > 5 Mo, même
  // pour un tracé très long. On lit startLat/startLon avec le geojson pour
  // récupérer les valeurs fraîches après réparation.
  const heavyById = new Map<
    string,
    { geojson: unknown; elevationPoints: unknown; startLat: number | null; startLon: number | null }
  >()
  await mapLimit(trip.segments, 6, async (m) => {
    const [geo, elev] = await Promise.all([
      db.segment.findUnique({
        where: { id: m.id },
        select: { geojson: true, startLat: true, startLon: true },
      }),
      db.segment.findUnique({
        where: { id: m.id },
        select: { elevationPoints: true },
      }),
    ])
    heavyById.set(m.id, {
      geojson:         geo?.geojson ?? null,
      startLat:        geo?.startLat ?? null,
      startLon:        geo?.startLon ?? null,
      elevationPoints: elev?.elevationPoints ?? null,
    })
  })

  const totalDistanceM  = trip.segments.reduce((sum, seg) => sum + (seg.distanceM      ?? 0), 0)
  const totalElevGainM  = trip.segments.reduce((sum, seg) => sum + (seg.elevationGainM ?? 0), 0)
  const totalElevLossM  = trip.segments.reduce((sum, seg) => sum + (seg.elevationLossM ?? 0), 0)

  const segments = trip.segments.map((s) => {
    const heavy = heavyById.get(s.id)
    return {
      id:              s.id,
      type:            s.type,
      name:            s.name,
      geojson:         heavy?.geojson
                         ? downsampleGeojson(heavy.geojson as unknown as GeoJSON.FeatureCollection, MAX_MAP_POINTS)
                         : null,
      distanceM:       s.distanceM,
      elevationGainM:  s.elevationGainM,
      elevationLossM:  s.elevationLossM,
      elevationPoints: heavy?.elevationPoints
                         ? downsampleArray(
                             heavy.elevationPoints as Array<{ distanceM: number; elevationM: number }>,
                             MAX_CHART_POINTS,
                           )
                         : null,
      durationMin:     s.durationMin,
      departureAt:     s.departureAt ? s.departureAt.toISOString() : null,
      arrivalAt:       s.arrivalAt   ? s.arrivalAt.toISOString()   : null,
      origin:          s.origin,
      destination:     s.destination,
      startLat:        heavy?.startLat ?? s.startLat,
      startLon:        heavy?.startLon ?? s.startLon,
      komootUrl:       s.komootUrl ?? null,
      notes:           s.notes ?? null,
      transportMode:   s.transportMode ?? null,
      terminal:        s.terminal ?? null,
      showOnMap:       s.showOnMap,
    }
  })

  const stopovers = trip.stopovers.map((s) => ({
    id:        s.id,
    sortOrder: s.sortOrder,
    date:      s.date.toISOString(),
    endDate:   s.endDate ? s.endDate.toISOString() : null,
    name:      s.name ?? null,
    place:     s.place ?? null,
    lat:       s.lat ?? null,
    lon:       s.lon ?? null,
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
