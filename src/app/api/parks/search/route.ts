import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

const OSM_PREFIX: Record<string, string> = { node: "N", way: "W", relation: "R" }

interface NominatimResult {
  osm_type?: string
  osm_id?: number
  lat?: string
  lon?: string
  name?: string
  display_name?: string
  class?: string
  type?: string
}

// Types OSM pertinents pour « parcs / régions naturelles ».
const PARK_TYPES = new Set([
  "national_park", "protected_area", "nature_reserve", "park", "forest", "wood", "peak", "nature",
])

// ─── GET /api/parks/search?q=... ──────────────────────────────────────────────
export async function GET(req: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  const q = new URL(req.url).searchParams.get("q")?.trim()
  if (!q || q.length < 3) return Response.json([])

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=10&addressdetails=0`
    const res = await fetch(url, { headers: { "User-Agent": "Senchy/1.0 (contact@senchy.app)" } })
    if (!res.ok) return Response.json([])

    const data = (await res.json()) as NominatimResult[]
    const mapped = data
      .filter((r) => r.osm_type && r.osm_id != null && r.lat && r.lon)
      .map((r) => {
        const prefix = OSM_PREFIX[r.osm_type as string] ?? ""
        return {
          osm:  `${prefix}${r.osm_id}`,
          name: r.name || (r.display_name ?? "").split(",")[0] || "Parc",
          lat:  parseFloat(r.lat as string),
          lon:  parseFloat(r.lon as string),
          kind: r.type ?? r.class ?? "",
          rank: PARK_TYPES.has(r.type ?? "") ? 0 : 1, // parcs/nature en premier
        }
      })
      .filter((r) => r.osm.length > 1)

    // Parcs/nature d'abord, puis le reste.
    mapped.sort((a, b) => a.rank - b.rank)

    return Response.json(mapped.slice(0, 8).map(({ rank: _rank, ...r }) => r))
  } catch {
    return Response.json([])
  }
}
