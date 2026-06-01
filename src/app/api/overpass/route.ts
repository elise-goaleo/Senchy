import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { requireTripOwnership } from "@/lib/ownership"

const MAX_RESULTS = 200
const OVERPASS_TIMEOUT_S = 25
const OVERPASS_URL = "https://overpass-api.de/api/interpreter"

// ─── Category → Overpass tag mappings ────────────────────────────────────────

const CATEGORY_TAGS: Record<string, string> = {
  supermarket: '["shop"="supermarket"]',
  toilet: '["amenity"="toilets"]',
  sight: '["tourism"]',
  restaurant: '["amenity"="restaurant"]',
  cafe: '["amenity"="cafe"]',
  hotel: '["tourism"="hotel"]',
  hospital: '["amenity"="hospital"]',
  pharmacy: '["amenity"="pharmacy"]',
  bicycle_shop: '["shop"="bicycle"]',
  water: '["amenity"="drinking_water"]',
  camp: '["tourism"="camp_site"]',
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

// ─── Normalised POI candidate ─────────────────────────────────────────────────

interface PoiCandidate {
  osmId: number
  name: string | undefined
  category: string
  lat: number
  lon: number
}

// ─── Build Overpass QL query ──────────────────────────────────────────────────

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
out center ${MAX_RESULTS};`
}

// ─── GET /api/overpass?tripId=xxx&categories=supermarket,toilet,sight ─────────

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const tripId = searchParams.get("tripId")
  const categoriesParam = searchParams.get("categories")

  if (!tripId) {
    return Response.json({ error: "tripId is required" }, { status: 400 })
  }

  const categories = categoriesParam
    ? categoriesParam.split(",").map((c) => c.trim()).filter(Boolean)
    : []

  if (categories.length === 0) {
    return Response.json(
      { error: "At least one category is required" },
      { status: 400 }
    )
  }

  // Validate categories
  const unknown = categories.filter((c) => !CATEGORY_TAGS[c])
  if (unknown.length > 0) {
    return Response.json(
      {
        error: `Unknown categories: ${unknown.join(", ")}`,
        supported: Object.keys(CATEGORY_TAGS),
      },
      { status: 400 }
    )
  }

  try {
    await requireTripOwnership(tripId, user.id)
  } catch (err) {
    if (err instanceof Response) return err
    throw err
  }

  try {
    // ── Fetch segments to compute bounding box ────────────────────────────────
    const segments = await db.segment.findMany({
      where: { tripId },
      select: { geojson: true },
    })

    if (segments.length === 0) {
      return Response.json(
        { error: "Trip has no segments — cannot compute bounding box" },
        { status: 422 }
      )
    }

    let minLat = Infinity
    let maxLat = -Infinity
    let minLon = Infinity
    let maxLon = -Infinity

    for (const seg of segments) {
      if (!seg.geojson) continue
      const geojson = seg.geojson as unknown as GeoJSON.FeatureCollection

      for (const feature of geojson.features ?? []) {
        if (!feature.geometry) continue
        let coords: number[][] = []

        if (feature.geometry.type === "LineString") {
          coords = feature.geometry.coordinates
        } else if (feature.geometry.type === "MultiLineString") {
          for (const line of feature.geometry.coordinates) {
            coords.push(...line)
          }
        }

        for (const c of coords) {
          const lon = c[0]
          const lat = c[1]
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
          if (lon < minLon) minLon = lon
          if (lon > maxLon) maxLon = lon
        }
      }
    }

    if (!isFinite(minLat)) {
      return Response.json(
        { error: "Could not compute bounding box from segments" },
        { status: 422 }
      )
    }

    const bbox = { minLat, maxLat, minLon, maxLon }
    const query = buildOverpassQuery(categories, bbox)

    // ── Call Overpass API ─────────────────────────────────────────────────────
    let overpassRes: Response
    try {
      overpassRes = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30_000), // 30 s hard timeout
      })
    } catch (fetchErr) {
      const msg =
        fetchErr instanceof Error && fetchErr.name === "TimeoutError"
          ? "Overpass API timed out"
          : "Failed to reach Overpass API"
      return Response.json({ error: msg }, { status: 504 })
    }

    if (!overpassRes.ok) {
      return Response.json(
        { error: `Overpass API returned ${overpassRes.status}` },
        { status: 502 }
      )
    }

    const data = (await overpassRes.json()) as OverpassResponse

    // ── Normalise results ─────────────────────────────────────────────────────
    const pois: PoiCandidate[] = []

    for (const el of data.elements ?? []) {
      if (pois.length >= MAX_RESULTS) break

      const lat = el.lat ?? el.center?.lat
      const lon = el.lon ?? el.center?.lon
      if (lat === undefined || lon === undefined) continue

      // Determine category from tags
      let category: string | undefined
      const tags = el.tags ?? {}

      if (tags.shop === "supermarket") category = "supermarket"
      else if (tags.amenity === "toilets") category = "toilet"
      else if (tags.tourism !== undefined) category = "sight"
      else if (tags.amenity === "restaurant") category = "restaurant"
      else if (tags.amenity === "cafe") category = "cafe"
      else if (tags.tourism === "hotel") category = "hotel"
      else if (tags.amenity === "hospital") category = "hospital"
      else if (tags.amenity === "pharmacy") category = "pharmacy"
      else if (tags.shop === "bicycle") category = "bicycle_shop"
      else if (tags.amenity === "drinking_water") category = "water"
      else if (tags.tourism === "camp_site") category = "camp"

      // Fall back to the first requested category if we can't determine it
      if (!category) category = categories[0]

      pois.push({
        osmId: el.id,
        name: tags.name,
        category,
        lat,
        lon,
      })
    }

    return Response.json({ pois, bbox })
  } catch (error) {
    console.error("[GET /api/overpass]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
