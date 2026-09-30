import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

const OSM_PREFIX: Record<string, string> = { node: "N", way: "W", relation: "R" }
const MAX_RING_POINTS = 500

const round4 = (n: number) => Math.round(n * 1e4) / 1e4

// Échantillonne une bague de polygone en gardant ses extrémités (et la fermeture).
function slimRing(ring: number[][]): number[][] {
  let pts = ring
  if (ring.length > MAX_RING_POINTS) {
    const step = (ring.length - 1) / (MAX_RING_POINTS - 1)
    pts = Array.from({ length: MAX_RING_POINTS }, (_, i) => ring[Math.round(i * step)])
  }
  const out = pts.map((c) => [round4(c[0]), round4(c[1])])
  // Referme la bague si besoin.
  const first = out[0], last = out[out.length - 1]
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) out.push([first[0], first[1]])
  return out
}

function slimGeometry(geom: { type?: string; coordinates?: unknown } | null): unknown {
  if (!geom) return null
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: (geom.coordinates as number[][][]).map(slimRing) }
  }
  if (geom.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: (geom.coordinates as number[][][][]).map((poly) => poly.map(slimRing)) }
  }
  return null // on n'affiche que des surfaces
}

interface LookupResult {
  osm_type?: string
  osm_id?: number
  name?: string
  display_name?: string
  geojson?: { type?: string; coordinates?: unknown }
}

// ─── GET /api/parks/geometry?ids=R123,R456 ────────────────────────────────────
export async function GET(req: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  const empty = { type: "FeatureCollection", features: [] as unknown[] }
  const raw = new URL(req.url).searchParams.get("ids")?.trim()
  if (!raw) return Response.json(empty)

  const ids = raw.split(",").map((s) => s.trim()).filter((s) => /^[NWR]\d+$/.test(s)).slice(0, 50)
  if (ids.length === 0) return Response.json(empty)

  try {
    const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=${ids.join(",")}&format=json&polygon_geojson=1`
    const res = await fetch(url, {
      headers: { "User-Agent": "Senchy/1.0 (contact@senchy.app)" },
      next: { revalidate: 60 * 60 * 24 * 30 },
    })
    if (!res.ok) return Response.json(empty, { headers: { "Cache-Control": "public, max-age=86400" } })

    const data = (await res.json()) as LookupResult[]
    const features = data
      .map((r) => {
        const geometry = slimGeometry(r.geojson ?? null)
        if (!geometry) return null
        const prefix = OSM_PREFIX[r.osm_type as string] ?? ""
        return {
          type: "Feature" as const,
          properties: { osm: `${prefix}${r.osm_id}`, name: r.name || (r.display_name ?? "").split(",")[0] || "Parc" },
          geometry,
        }
      })
      .filter(Boolean)

    return Response.json(
      { type: "FeatureCollection", features },
      { headers: { "Cache-Control": "public, max-age=86400" } }
    )
  } catch {
    return Response.json(empty, { headers: { "Cache-Control": "public, max-age=3600" } })
  }
}
