import { z } from "zod"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

const MAX_RESULTS = 500
const OVERPASS_TIMEOUT_S = 25
const FETCH_TIMEOUT_MS = 28_000

// Tuilage : on découpe la trace en portions dont la bbox ne dépasse pas cette
// taille (en degrés ≈ 22 km), pour garder chaque requête Overpass légère.
const TILE_SPAN_DEG = 0.2
const MAX_TILES = 30
const TILE_CONCURRENCY = 2

// Instances Overpass essayées dans l'ordre (bascule sur la suivante en cas
// de 504/429/erreur réseau). L'instance française est prioritaire (fiable et
// proche) ; overpass-api.de est très souvent saturé et sert de dernier recours.
const OVERPASS_ENDPOINTS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
]

// Nombre max de points de trace conservés pour le filtrage de distance.
const MAX_FILTER_POINTS = 2000

// ─── Category → Overpass tag mappings ────────────────────────────────────────

const CATEGORY_TAGS: Record<string, string> = {
  bakery:      '["shop"="bakery"]',
  supermarket: '["shop"="supermarket"]',
  water:       '["amenity"="drinking_water"]',
  toilet:      '["amenity"="toilets"]',
}

// ─── Overpass element shape ───────────────────────────────────────────────────

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements: OverpassElement[]
}

// ─── Request schema ───────────────────────────────────────────────────────────

const bodySchema = z.object({
  // Trace : liste de [lon, lat] (ordre GeoJSON).
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2).max(100000),
  categories:  z.array(z.enum(["bakery", "supermarket", "water", "toilet"])).min(1),
  radius:      z.number().int().min(50).max(2000).optional(),
})

// ─── Géométrie : distance point → trace (approx. planaire locale) ─────────────

function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr
  const step = (arr.length - 1) / (maxPoints - 1)
  const out: T[] = []
  for (let i = 0; i < maxPoints; i++) out.push(arr[Math.round(i * step)])
  return out
}

// Distance minimale (m) d'un point aux segments de la trace. La trace est
// projetée en mètres localement (suffisant à cette échelle).
function distanceToRouteM(
  lat: number,
  lon: number,
  route: [number, number][], // [lon, lat]
  lat0: number
): number {
  const R = 6371000
  const rad = Math.PI / 180
  const cos0 = Math.cos(lat0 * rad)
  const toXY = (la: number, lo: number): [number, number] => [R * lo * rad * cos0, R * la * rad]

  const [px, py] = toXY(lat, lon)
  let min = Infinity

  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = toXY(route[i - 1][1], route[i - 1][0])
    const [bx, by] = toXY(route[i][1], route[i][0])
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx
    const cy = ay + t * dy
    const d = Math.hypot(px - cx, py - cy)
    if (d < min) min = d
  }
  return min
}

// ─── Construction de la requête Overpass QL (bbox — bien plus léger) ──────────

function buildOverpassQuery(
  categories: string[],
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }
): string {
  const bboxStr = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`
  const lines: string[] = []
  for (const cat of categories) {
    const tag = CATEGORY_TAGS[cat]
    if (!tag) continue
    lines.push(`  node${tag}(${bboxStr});`)
    lines.push(`  way${tag}(${bboxStr});`)
  }
  return `[out:json][timeout:${OVERPASS_TIMEOUT_S}];
(
${lines.join("\n")}
);
out center ${MAX_RESULTS * 2};`
}

// ─── Tuilage de la trace ──────────────────────────────────────────────────────
//
// Découpe la trace en portions successives dont l'emprise (bbox) ne dépasse pas
// `spanDeg`. Chaque portion partage un point avec la précédente pour une
// couverture continue. Renvoie une bbox par tuile (marge = radius).

type Bbox = { minLat: number; maxLat: number; minLon: number; maxLon: number }

function tileRoute(coords: [number, number][], spanDeg: number, radius: number): Bbox[] {
  const tiles: Bbox[] = []
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  let count = 0

  const pushTile = () => {
    if (count === 0) return
    const latPad = radius / 111_000
    const lonPad = radius / (111_000 * Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)) || 1)
    tiles.push({
      minLat: minLat - latPad, maxLat: maxLat + latPad,
      minLon: minLon - lonPad, maxLon: maxLon + lonPad,
    })
  }

  let prev: [number, number] | null = null
  for (const [lon, lat] of coords) {
    const nMinLat = Math.min(minLat, lat), nMaxLat = Math.max(maxLat, lat)
    const nMinLon = Math.min(minLon, lon), nMaxLon = Math.max(maxLon, lon)
    if (count > 0 && ((nMaxLat - nMinLat) > spanDeg || (nMaxLon - nMinLon) > spanDeg)) {
      pushTile()
      // Nouvelle tuile démarrant sur le point précédent (recouvrement).
      minLat = maxLat = lat; minLon = maxLon = lon; count = 1
      if (prev) {
        minLat = Math.min(minLat, prev[1]); maxLat = Math.max(maxLat, prev[1])
        minLon = Math.min(minLon, prev[0]); maxLon = Math.max(maxLon, prev[0])
        count = 2
      }
    } else {
      minLat = nMinLat; maxLat = nMaxLat; minLon = nMinLon; maxLon = nMaxLon; count++
    }
    prev = [lon, lat]
  }
  pushTile()
  return tiles
}

// ─── Exécution concurrente bornée ─────────────────────────────────────────────

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

// ─── Appel Overpass avec bascule de miroir ────────────────────────────────────

async function fetchOverpass(query: string): Promise<
  { ok: true; data: OverpassResponse } | { ok: false; status: number; message: string }
> {
  // On termine par un nouvel essai de l'instance principale : elle renvoie
  // souvent 504 sous charge mais aboutit au coup d'après.
  const attempts = [...OVERPASS_ENDPOINTS, OVERPASS_ENDPOINTS[0]]
  let lastStatus = 0
  for (const endpoint of attempts) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Sans Accept/User-Agent explicites, Overpass renvoie 406.
          "Accept": "application/json",
          "User-Agent": "Senchy/1.0 (https://senchy.app)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (res.ok) {
        return { ok: true, data: (await res.json()) as OverpassResponse }
      }
      // 429 (rate limit) / 504 (timeout) / 502 : on tente le miroir suivant.
      lastStatus = res.status
      if (![429, 502, 503, 504].includes(res.status)) {
        return { ok: false, status: res.status, message: `Overpass a renvoyé ${res.status}` }
      }
    } catch {
      lastStatus = 504 // timeout / réseau → on tente le miroir suivant
    }
  }
  return {
    ok: false,
    status: 504,
    message:
      lastStatus === 429
        ? "Service Overpass saturé, réessaie dans un instant"
        : "Le service Overpass n'a pas répondu (trace trop longue ou serveurs occupés)",
  }
}

// ─── POST /api/quick-pois ─────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { categories, radius = 300 } = parsed.data
  const coordinates = parsed.data.coordinates

  // ── Découpage de la trace en tuiles (bbox locales, requêtes légères) ─────────
  let minLat = Infinity, maxLat = -Infinity
  for (const [, lat] of coordinates) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const lat0 = (minLat + maxLat) / 2

  // On agrandit la taille des tuiles tant qu'il y en a trop (traces très longues).
  let span = TILE_SPAN_DEG
  let tiles = tileRoute(coordinates, span, radius)
  while (tiles.length > MAX_TILES) {
    span *= 1.6
    tiles = tileRoute(coordinates, span, radius)
  }

  // ── Interrogation d'Overpass tuile par tuile ─────────────────────────────────
  const tileResults = await mapLimit(tiles, TILE_CONCURRENCY, (bbox) =>
    fetchOverpass(buildOverpassQuery(categories, bbox))
  )

  const okResults = tileResults.filter((r) => r.ok) as Array<{ ok: true; data: OverpassResponse }>
  const failed = tileResults.length - okResults.length

  // Toutes les tuiles ont échoué → on remonte l'erreur.
  if (okResults.length === 0) {
    const firstErr = tileResults.find((r) => !r.ok) as { message: string } | undefined
    return Response.json(
      { error: firstErr?.message ?? "Le service Overpass n'a pas répondu" },
      { status: 502 }
    )
  }

  // ── Fusion + filtrage : POI proches de la trace, dédupliqués ─────────────────
  const route = downsample(coordinates, MAX_FILTER_POINTS)
  const seen = new Set<number>()
  const pois: Array<{ osmId: number; name: string | null; category: string; lat: number; lon: number; openingHours: string | null }> = []

  for (const res of okResults) {
    for (const el of res.data.elements ?? []) {
      if (pois.length >= MAX_RESULTS) break
      if (seen.has(el.id)) continue

      const lat = el.lat ?? el.center?.lat
      const lon = el.lon ?? el.center?.lon
      if (lat === undefined || lon === undefined) continue

      const tags = el.tags ?? {}
      let category: string | undefined
      if (tags.shop === "bakery") category = "bakery"
      else if (tags.shop === "supermarket") category = "supermarket"
      else if (tags.amenity === "drinking_water") category = "water"
      else if (tags.amenity === "toilets") category = "toilet"
      if (!category) continue

      if (distanceToRouteM(lat, lon, route, lat0) > radius) continue

      seen.add(el.id)
      pois.push({
        osmId: el.id,
        name: tags.name ?? null,
        category,
        lat,
        lon,
        openingHours: tags.opening_hours ?? null,
      })
    }
  }

  // `partial` : certaines tuiles ont échoué → résultats incomplets.
  return Response.json({ pois, partial: failed > 0 })
}
